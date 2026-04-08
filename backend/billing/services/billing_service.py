from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from billing.models import (
    BillingCreditNote,
    BillingDebitNote,
    BillingDocumentStatus,
    BillingInvoice,
    ReceiptDocument,
    ReceiptType,
)
from inventory.services.stock_service import (
    post_credit_note_stock_movements,
    post_debit_note_stock_movements,
    post_invoice_stock_movements,
)
from subscriptions.models import AuditLog, Payment
from subscriptions.services.audit_service import log_audit


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _issue_series_number(sequence, *, prefix_fallback: str) -> str:
    from accounting.services.gst_document_posting_service import _issue_document_number

    number = _issue_document_number(sequence)
    return number if number else prefix_fallback


def _ensure_receipt_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_RCT",
        financial_year=fy,
        prefix=f"RCT-{fy}",
        padding=5,
    )


def _ensure_invoice_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_INV",
        financial_year=fy,
        prefix=f"INV-{fy}",
        padding=5,
    )


def _ensure_credit_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_CN",
        financial_year=fy,
        prefix=f"CN-{fy}",
        padding=5,
    )


def _ensure_debit_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_DN",
        financial_year=fy,
        prefix=f"DN-{fy}",
        padding=5,
    )


@transaction.atomic
def approve_billing_invoice(*, invoice_id: int, approved_by):
    invoice = BillingInvoice.objects.select_for_update().select_related("doc_series").get(pk=invoice_id)
    if invoice.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return invoice, False
    if invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValueError("Cancelled or void invoices cannot be approved.")
    if not invoice.lines.exists():
        raise ValueError("Invoices require at least one line before approval.")

    if not invoice.document_no:
        invoice.document_no = _issue_series_number(
            invoice.doc_series or _ensure_invoice_sequence(invoice.invoice_date),
            prefix_fallback=f"INV-{invoice.id}",
        )
    invoice.status = BillingDocumentStatus.APPROVED
    invoice.approved_by = approved_by
    invoice.approved_at = timezone.now()
    invoice.save(update_fields=["document_no", "status", "approved_by", "approved_at", "updated_at"])
    _log_accounting_event(
        event="BILLING_INVOICE_APPROVED",
        instance=invoice,
        performed_by=approved_by,
        metadata={"invoice_id": invoice.id, "document_no": invoice.document_no},
    )
    return invoice, True


@transaction.atomic
def post_billing_invoice(*, invoice_id: int, posted_by):
    invoice = (
        BillingInvoice.objects.select_for_update()
        .select_related("finance_account", "finance_account__chart_account", "posted_journal_entry")
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=invoice_id)
    )
    if invoice.status == BillingDocumentStatus.POSTED and invoice.posted_journal_entry_id:
        return invoice, False
    if invoice.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved invoices can be posted.")

    accounts = ensure_phase3_system_accounts()
    tax_total = _money(invoice.tax_total)
    journal_lines = [
        {
            "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
            "description": invoice.document_no or f"Invoice {invoice.id}",
            "debit_amount": invoice.grand_total,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": accounts["SALES_REVENUE"],
            "description": invoice.document_no or f"Invoice {invoice.id}",
            "debit_amount": Decimal("0.00"),
            "credit_amount": invoice.taxable_total,
        },
    ]
    if tax_total > 0:
        journal_lines.append(
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST {invoice.document_no or invoice.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": tax_total,
            }
        )

    posted_journal, _ = post_bridge_entry(
        source_instance=invoice,
        purpose="RETAIL_SALE",
        entry_date=invoice.invoice_date,
        memo=f"Retail invoice {invoice.document_no or invoice.id}",
        lines=journal_lines,
        posted_by=posted_by,
    )
    invoice.posted_journal_entry = posted_journal
    invoice.status = BillingDocumentStatus.POSTED
    invoice.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_invoice_stock_movements(invoice=invoice, posted_by=posted_by)
    auto_receipt_created = False
    if (
        _money(invoice.received_total) > Decimal("0.00")
        and invoice.finance_account_id
        and not invoice.receipts.exists()
    ):
        create_manual_receipt(
            receipt_date=invoice.invoice_date,
            finance_account_id=invoice.finance_account_id,
            amount=invoice.received_total,
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            billing_invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            subscription_id=invoice.subscription_id,
            notes=f"Auto-generated from posted invoice {invoice.document_no or invoice.id}",
            created_by=posted_by,
        )
        auto_receipt_created = True
    _log_accounting_event(
        event="BILLING_INVOICE_POSTED",
        instance=invoice,
        performed_by=posted_by,
        metadata={
            "invoice_id": invoice.id,
            "document_no": invoice.document_no,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
            "auto_receipt_created": auto_receipt_created,
        },
    )
    return invoice, True


def _create_receipt_journal(*, receipt, offset_account, posted_by):
    return post_bridge_entry(
        source_instance=receipt,
        purpose=receipt.receipt_type,
        entry_date=receipt.receipt_date,
        memo=f"Receipt {receipt.receipt_no or receipt.id}",
        lines=[
            {
                "chart_account": receipt.finance_account.chart_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": receipt.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": offset_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": receipt.amount,
            },
        ],
        posted_by=posted_by,
    )


@transaction.atomic
def create_manual_receipt(
    *,
    receipt_date,
    finance_account_id: int,
    amount,
    receipt_type: str,
    billing_invoice_id: int | None = None,
    customer_id: int | None = None,
    subscription_id: int | None = None,
    payment_id: int | None = None,
    notes: str = "",
    created_by=None,
):
    from accounting.models import FinanceAccount

    accounts = ensure_phase3_system_accounts()
    finance_account = FinanceAccount.objects.select_for_update().select_related("chart_account").get(pk=finance_account_id)
    sequence = _ensure_receipt_sequence(receipt_date)
    billing_invoice = BillingInvoice.objects.select_related("customer").filter(pk=billing_invoice_id).first() if billing_invoice_id else None
    payment = Payment.objects.select_related("customer").filter(pk=payment_id).first() if payment_id else None
    receipt = ReceiptDocument.objects.create(
        receipt_no=_issue_series_number(sequence, prefix_fallback="RCT"),
        receipt_type=receipt_type,
        status=BillingDocumentStatus.DRAFT,
        receipt_date=receipt_date,
        finance_account=finance_account,
        billing_invoice_id=billing_invoice_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        payment_id=payment_id,
        amount=amount,
        customer_name_snapshot=(
            payment.customer.name
            if payment is not None
            else billing_invoice.customer_name_snapshot if billing_invoice is not None else ""
        ),
        customer_phone_snapshot=(
            payment.customer.phone
            if payment is not None
            else billing_invoice.customer_phone_snapshot if billing_invoice is not None else ""
        ),
        notes=notes,
    )
    offset_account = (
        accounts["EMI_COLLECTION_CLEARING"]
        if receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT
        else accounts["ACCOUNTS_RECEIVABLE"]
    )
    posted_journal, _ = _create_receipt_journal(
        receipt=receipt,
        offset_account=offset_account,
        posted_by=created_by,
    )
    receipt.posted_journal_entry = posted_journal
    receipt.status = BillingDocumentStatus.POSTED
    receipt.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="BILLING_RECEIPT_POSTED",
        instance=receipt,
        performed_by=created_by,
        metadata={
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "journal_entry_id": posted_journal.id,
        },
    )
    return receipt


@transaction.atomic
def generate_emi_payment_receipt(*, payment_id: int, finance_account_id: int, performed_by):
    payment = Payment.objects.select_for_update().select_related(
        "customer",
        "subscription",
    ).get(pk=payment_id)
    if ReceiptDocument.objects.filter(payment_id=payment.id).exists():
        receipt = ReceiptDocument.objects.get(payment_id=payment.id)
        return receipt, False

    receipt = create_manual_receipt(
        receipt_date=payment.payment_date,
        finance_account_id=finance_account_id,
        amount=payment.amount,
        receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
        customer_id=payment.customer_id,
        subscription_id=payment.subscription_id,
        payment_id=payment.id,
        notes=f"Generated from operational payment {payment.id}",
        created_by=performed_by,
    )
    return receipt, True


@transaction.atomic
def void_receipt_document(*, receipt_id: int, performed_by, reason: str):
    receipt = (
        ReceiptDocument.objects.select_for_update()
        .select_related("finance_account", "finance_account__chart_account", "posted_journal_entry")
        .get(pk=receipt_id)
    )
    if receipt.status == BillingDocumentStatus.VOID:
        return receipt, False
    if receipt.status != BillingDocumentStatus.POSTED:
        raise ValueError("Only posted receipts can be voided.")

    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Void reason is required.")

    accounts = ensure_phase3_system_accounts()
    offset_account = (
        accounts["EMI_COLLECTION_CLEARING"]
        if receipt.receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT
        else accounts["ACCOUNTS_RECEIVABLE"]
    )
    reversal_journal, _ = post_bridge_entry(
        source_instance=receipt,
        purpose=f"{receipt.receipt_type}_VOID",
        entry_date=timezone.localdate(),
        memo=f"Void receipt {receipt.receipt_no or receipt.id}",
        lines=[
            {
                "chart_account": offset_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": receipt.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": receipt.finance_account.chart_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": receipt.amount,
            },
        ],
        posted_by=performed_by,
    )
    receipt.status = BillingDocumentStatus.VOID
    receipt.notes = f"{(receipt.notes or '').strip()}\nVoid reason: {reason}".strip()
    receipt.save(update_fields=["status", "notes", "updated_at"])
    _log_accounting_event(
        event="BILLING_RECEIPT_VOIDED",
        instance=receipt,
        performed_by=performed_by,
        metadata={
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "reason": reason,
            "reversal_journal_entry_id": reversal_journal.id,
        },
    )
    return receipt, True


def _approve_note(note, *, approved_by, sequence_factory, event_name: str):
    if note.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return note, False
    if note.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValueError("Cancelled or void notes cannot be approved.")
    if not note.note_no:
        note.note_no = _issue_series_number(sequence_factory(note.note_date), prefix_fallback=f"NOTE-{note.id}")
    note.status = BillingDocumentStatus.APPROVED
    note.save(update_fields=["note_no", "status", "updated_at"])
    _log_accounting_event(
        event=event_name,
        instance=note,
        performed_by=approved_by,
        metadata={"note_id": note.id, "note_no": note.note_no},
    )
    return note, True


@transaction.atomic
def approve_billing_credit_note(*, credit_note_id: int, approved_by):
    note = BillingCreditNote.objects.select_for_update().get(pk=credit_note_id)
    return _approve_note(
        note,
        approved_by=approved_by,
        sequence_factory=_ensure_credit_sequence,
        event_name="BILLING_CREDIT_NOTE_APPROVED",
    )


@transaction.atomic
def approve_billing_debit_note(*, debit_note_id: int, approved_by):
    note = BillingDebitNote.objects.select_for_update().get(pk=debit_note_id)
    return _approve_note(
        note,
        approved_by=approved_by,
        sequence_factory=_ensure_debit_sequence,
        event_name="BILLING_DEBIT_NOTE_APPROVED",
    )


@transaction.atomic
def post_billing_credit_note(*, credit_note_id: int, posted_by):
    note = BillingCreditNote.objects.select_for_update().prefetch_related("lines").get(pk=credit_note_id)
    if note.status == BillingDocumentStatus.POSTED and note.posted_journal_entry_id:
        return note, False
    if note.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved credit notes can be posted.")

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="RETAIL_CREDIT_NOTE",
        entry_date=note.note_date,
        memo=f"Billing credit note {note.note_no or note.id}",
        lines=[
            {
                "chart_account": accounts["SALES_RETURNS"],
                "description": note.note_no or str(note.id),
                "debit_amount": note.taxable_adjustment,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST reversal {note.note_no or note.id}",
                "debit_amount": note.tax_adjustment,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": note.note_no or str(note.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": note.total_adjustment,
            },
        ],
        posted_by=posted_by,
    )
    note.posted_journal_entry = posted_journal
    note.status = BillingDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_credit_note_stock_movements(note=note, posted_by=posted_by) if note.stock_effect else {"created_count": 0, "existing_count": 0}
    _log_accounting_event(
        event="BILLING_CREDIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={
            "note_id": note.id,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
        },
    )
    return note, True


@transaction.atomic
def post_billing_debit_note(*, debit_note_id: int, posted_by):
    note = BillingDebitNote.objects.select_for_update().prefetch_related("lines").get(pk=debit_note_id)
    if note.status == BillingDocumentStatus.POSTED and note.posted_journal_entry_id:
        return note, False
    if note.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved debit notes can be posted.")

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="RETAIL_DEBIT_NOTE",
        entry_date=note.note_date,
        memo=f"Billing debit note {note.note_no or note.id}",
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": note.note_no or str(note.id),
                "debit_amount": note.total_adjustment,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": note.note_no or str(note.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": note.taxable_adjustment,
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST increase {note.note_no or note.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": note.tax_adjustment,
            },
        ],
        posted_by=posted_by,
    )
    note.posted_journal_entry = posted_journal
    note.status = BillingDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_debit_note_stock_movements(note=note, posted_by=posted_by) if note.stock_effect else {"created_count": 0, "existing_count": 0}
    _log_accounting_event(
        event="BILLING_DEBIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={
            "note_id": note.id,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
        },
    )
    return note, True


def mark_document_printed(*, instance, performed_by=None):
    instance.printed_count = (instance.printed_count or 0) + 1
    instance.printed_at = timezone.now()
    instance.save(update_fields=["printed_count", "printed_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=instance,
        performed_by=performed_by,
        metadata={
            "event": "BILLING_DOCUMENT_PRINTED",
            "printed_count": instance.printed_count,
        },
    )
    return instance
