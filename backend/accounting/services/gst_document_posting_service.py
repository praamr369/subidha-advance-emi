from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    MONEY_ZERO,
    ChartOfAccount,
    ChartOfAccountType,
    CreditNote,
    DebitNote,
    DocumentSequence,
    JournalEntryType,
    TaxDocumentStatus,
    TaxInvoice,
)
from accounting.services.tax_guard_service import assert_gst_invoice_allowed
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.document_sequence_service import (
    DOCUMENT_TYPE_BY_SERIES_CODE,
    preview_document_number,
)
from accounting.services.journal_posting_service import (
    _log_accounting_event,
)
from accounting.services.system_accounts_service import ensure_system_account


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def financial_year_for(reference_date: date) -> str:
    if reference_date.month >= 4:
        start_year = reference_date.year
        end_year = reference_date.year + 1
    else:
        start_year = reference_date.year - 1
        end_year = reference_date.year
    return f"{start_year}-{str(end_year)[-2:]}"


def ensure_document_sequence(
    *,
    series_code: str,
    financial_year: str,
    prefix: str = "",
    padding: int = 5,
) -> DocumentSequence:
    cleaned_series = series_code.strip().upper()
    document_type = DOCUMENT_TYPE_BY_SERIES_CODE.get(cleaned_series, cleaned_series[:40])
    sequence, created = DocumentSequence.objects.get_or_create(
        document_type=document_type,
        financial_year=financial_year,
        is_active=True,
        defaults={
            "series_code": cleaned_series,
            "prefix": prefix,
            "pattern": "{PREFIX}-{number}",
            "padding": padding,
            "next_number": 1,
        },
    )
    if created:
        return sequence
    updates = []
    if not sequence.series_code:
        sequence.series_code = cleaned_series
        updates.append("series_code")
    if not sequence.prefix and prefix:
        sequence.prefix = prefix
        updates.append("prefix")
    if not sequence.pattern:
        sequence.pattern = "{PREFIX}-{number}"
        updates.append("pattern")
    if updates:
        sequence.save(update_fields=updates + ["updated_at"])
    return sequence


def _ensure_system_account(
    *,
    system_code: str,
    code: str,
    name: str,
    account_type: str,
) -> ChartOfAccount:
    # Preserve import compatibility for existing callers.
    result = ensure_system_account(
        system_code=system_code,
        code=code,
        name=name,
        account_type=account_type,
        allow_manual_posting=False,
        reactivate=False,
    )
    return result.account


def ensure_gst_system_accounts() -> dict[str, ChartOfAccount]:
    return {
        "ACCOUNTS_RECEIVABLE": _ensure_system_account(
            system_code="ACCOUNTS_RECEIVABLE",
            code="AR-1000",
            name="Accounts Receivable",
            account_type=ChartOfAccountType.ASSET,
        ),
        "ACCOUNTS_PAYABLE": _ensure_system_account(
            system_code="ACCOUNTS_PAYABLE",
            code="AP-2000",
            name="Accounts Payable",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "SALES_REVENUE": _ensure_system_account(
            system_code="SALES_REVENUE",
            code="REV-4000",
            name="Sales Revenue",
            account_type=ChartOfAccountType.INCOME,
        ),
        "OUTPUT_GST": _ensure_system_account(
            system_code="OUTPUT_GST",
            code="GST-2100",
            name="Output GST Payable",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "INPUT_GST": _ensure_system_account(
            system_code="INPUT_GST",
            code="GST-1100",
            name="Input GST Receivable",
            account_type=ChartOfAccountType.ASSET,
        ),
        "GST_ADJUSTMENTS": _ensure_system_account(
            system_code="GST_ADJUSTMENTS",
            code="GST-4100",
            name="GST Adjustments",
            account_type=ChartOfAccountType.INCOME,
        ),
    }


def _issue_document_number(sequence: DocumentSequence) -> str:
    locked_sequence = DocumentSequence.objects.select_for_update().get(pk=sequence.pk)
    number = locked_sequence.next_number
    rendered = preview_document_number(sequence=locked_sequence)
    locked_sequence.next_number = number + 1
    locked_sequence.last_issued_at = timezone.now()
    locked_sequence.save(update_fields=["next_number", "last_issued_at", "updated_at"])
    return rendered


def _tax_total(document) -> Decimal:
    return _money(getattr(document, "cgst_amount", MONEY_ZERO)) + _money(
        getattr(document, "sgst_amount", MONEY_ZERO)
    ) + _money(getattr(document, "igst_amount", MONEY_ZERO))


@transaction.atomic
def approve_tax_invoice(*, tax_invoice_id: int, approved_by) -> tuple[TaxInvoice, bool]:
    assert_gst_invoice_allowed(operation="GST tax invoice approval")
    invoice = TaxInvoice.objects.select_for_update().select_related("doc_series").get(
        pk=tax_invoice_id
    )
    if invoice.status == TaxDocumentStatus.CANCELLED:
        raise ValueError("Cancelled tax invoices cannot be approved.")
    if invoice.status in {TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED}:
        return invoice, False

    sequence = invoice.doc_series
    if not invoice.invoice_no:
        invoice.invoice_no = _issue_document_number(sequence)
    invoice.status = TaxDocumentStatus.APPROVED
    invoice.approved_by = approved_by
    invoice.approved_at = timezone.now()
    invoice.save(
        update_fields=[
            "invoice_no",
            "status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )
    _log_accounting_event(
        event="ACCOUNTING_TAX_INVOICE_APPROVED",
        instance=invoice,
        performed_by=approved_by,
        metadata={"invoice_no": invoice.invoice_no},
    )
    return invoice, True


@transaction.atomic
def post_tax_invoice(*, tax_invoice_id: int, posted_by) -> tuple[TaxInvoice, bool]:
    assert_gst_invoice_allowed(operation="GST tax invoice posting")
    invoice = TaxInvoice.objects.select_for_update().select_related(
        "doc_series",
        "posted_journal_entry",
    ).get(pk=tax_invoice_id)
    if invoice.status == TaxDocumentStatus.POSTED:
        return invoice, False
    if invoice.status != TaxDocumentStatus.APPROVED:
        raise ValueError("Only approved tax invoices can be posted.")

    accounts = ensure_gst_system_accounts()
    tax_total = _tax_total(invoice)
    posted_journal, created = post_bridge_entry(
        source_instance=invoice,
        purpose="GST_TAX_INVOICE",
        entry_date=invoice.invoice_date,
        memo=f"Tax invoice {invoice.invoice_no or invoice.id}",
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": "Invoice receivable",
                "debit_amount": invoice.total_amount,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": "Taxable value",
                "debit_amount": MONEY_ZERO,
                "credit_amount": invoice.subtotal_taxable,
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": "GST output",
                "debit_amount": MONEY_ZERO,
                "credit_amount": tax_total,
            },
        ],
        posted_by=posted_by,
    )
    if not created:
        bridge = AccountingBridgePosting.objects.get(
            source_model="TaxInvoice",
            source_id=str(invoice.id),
            purpose="GST_TAX_INVOICE",
        )
        posted_journal = bridge.journal_entry
    invoice.posted_journal_entry = posted_journal
    invoice.status = TaxDocumentStatus.POSTED
    invoice.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_TAX_INVOICE_POSTED",
        instance=invoice,
        performed_by=posted_by,
        metadata={
            "invoice_no": invoice.invoice_no,
            "journal_entry_id": posted_journal.id,
            "journal_entry_no": posted_journal.entry_no,
        },
    )
    return invoice, True


def _approve_note(note, *, approved_by, event_name: str):
    if note.status == TaxDocumentStatus.CANCELLED:
        raise ValueError("Cancelled GST notes cannot be approved.")
    if note.status in {TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED}:
        return note, False

    if not note.note_no:
        note.note_no = _issue_document_number(note.doc_series)
    note.status = TaxDocumentStatus.APPROVED
    note.approved_by = approved_by
    note.approved_at = timezone.now()
    note.save(
        update_fields=[
            "note_no",
            "status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )
    _log_accounting_event(
        event=event_name,
        instance=note,
        performed_by=approved_by,
        metadata={"note_no": note.note_no},
    )
    return note, True


@transaction.atomic
def approve_credit_note(*, credit_note_id: int, approved_by) -> tuple[CreditNote, bool]:
    assert_gst_invoice_allowed(operation="GST credit note approval")
    note = CreditNote.objects.select_for_update().select_related("doc_series").get(
        pk=credit_note_id
    )
    return _approve_note(
        note,
        approved_by=approved_by,
        event_name="ACCOUNTING_CREDIT_NOTE_APPROVED",
    )


@transaction.atomic
def approve_debit_note(*, debit_note_id: int, approved_by) -> tuple[DebitNote, bool]:
    assert_gst_invoice_allowed(operation="GST debit note approval")
    note = DebitNote.objects.select_for_update().select_related("doc_series").get(
        pk=debit_note_id
    )
    return _approve_note(
        note,
        approved_by=approved_by,
        event_name="ACCOUNTING_DEBIT_NOTE_APPROVED",
    )


@transaction.atomic
def post_credit_note(*, credit_note_id: int, posted_by) -> tuple[CreditNote, bool]:
    assert_gst_invoice_allowed(operation="GST credit note posting")
    note = CreditNote.objects.select_for_update().select_related(
        "posted_journal_entry"
    ).get(pk=credit_note_id)
    if note.status == TaxDocumentStatus.POSTED:
        return note, False
    if note.status != TaxDocumentStatus.APPROVED:
        raise ValueError("Only approved credit notes can be posted.")

    accounts = ensure_gst_system_accounts()
    posted_journal, created = post_bridge_entry(
        source_instance=note,
        purpose="GST_CREDIT_NOTE",
        entry_date=note.note_date,
        memo=f"Credit note {note.note_no or note.id}",
        lines=[
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": "Revenue reversal",
                "debit_amount": note.taxable_adjustment,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": "GST reversal",
                "debit_amount": note.tax_adjustment,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": "Receivable reduction",
                "debit_amount": MONEY_ZERO,
                "credit_amount": note.total_adjustment,
            },
        ],
        posted_by=posted_by,
    )
    if not created:
        bridge = AccountingBridgePosting.objects.get(
            source_model="CreditNote",
            source_id=str(note.id),
            purpose="GST_CREDIT_NOTE",
        )
        posted_journal = bridge.journal_entry
    note.posted_journal_entry = posted_journal
    note.status = TaxDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_CREDIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={"note_no": note.note_no, "journal_entry_id": posted_journal.id},
    )
    return note, True


@transaction.atomic
def post_debit_note(*, debit_note_id: int, posted_by) -> tuple[DebitNote, bool]:
    assert_gst_invoice_allowed(operation="GST debit note posting")
    note = DebitNote.objects.select_for_update().select_related(
        "posted_journal_entry"
    ).get(pk=debit_note_id)
    if note.status == TaxDocumentStatus.POSTED:
        return note, False
    if note.status != TaxDocumentStatus.APPROVED:
        raise ValueError("Only approved debit notes can be posted.")

    accounts = ensure_gst_system_accounts()
    posted_journal, created = post_bridge_entry(
        source_instance=note,
        purpose="GST_DEBIT_NOTE",
        entry_date=note.note_date,
        memo=f"Debit note {note.note_no or note.id}",
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": "Receivable increase",
                "debit_amount": note.total_adjustment,
                "credit_amount": MONEY_ZERO,
            },
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": "Revenue increase",
                "debit_amount": MONEY_ZERO,
                "credit_amount": note.taxable_adjustment,
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": "GST increase",
                "debit_amount": MONEY_ZERO,
                "credit_amount": note.tax_adjustment,
            },
        ],
        posted_by=posted_by,
    )
    if not created:
        bridge = AccountingBridgePosting.objects.get(
            source_model="DebitNote",
            source_id=str(note.id),
            purpose="GST_DEBIT_NOTE",
        )
        posted_journal = bridge.journal_entry
    note.posted_journal_entry = posted_journal
    note.status = TaxDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="ACCOUNTING_DEBIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={"note_no": note.note_no, "journal_entry_id": posted_journal.id},
    )
    return note, True
