from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import CreditNote, DebitNote, TaxDocumentStatus, TaxInvoice
from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import _tax_total, ensure_gst_system_accounts
from accounting.services.journal_posting_service import _log_accounting_event


def _strip_reason(reason: str) -> str:
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Cancellation reason is required.")
    return reason


@transaction.atomic
def cancel_tax_invoice(*, tax_invoice_id: int, performed_by, reason: str):
    invoice = TaxInvoice.objects.select_for_update().get(pk=tax_invoice_id)
    if invoice.status == TaxDocumentStatus.CANCELLED:
        return invoice, False
    if invoice.status != TaxDocumentStatus.POSTED:
        raise ValueError("Only posted tax invoices can be cancelled.")

    reason = _strip_reason(reason)
    accounts = ensure_gst_system_accounts()
    reversal_journal, _ = post_bridge_entry(
        source_instance=invoice,
        purpose="GST_TAX_INVOICE_CANCEL",
        entry_date=timezone.localdate(),
        memo=f"Cancellation of tax invoice {invoice.invoice_no or invoice.id}",
        lines=[
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": invoice.invoice_no or str(invoice.id),
                "debit_amount": invoice.subtotal_taxable,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST cancel {invoice.invoice_no or invoice.id}",
                "debit_amount": _tax_total(invoice),
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": invoice.invoice_no or str(invoice.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": invoice.total_amount,
            },
        ],
        posted_by=performed_by,
    )
    invoice.status = TaxDocumentStatus.CANCELLED
    invoice.cancelled_by = performed_by
    invoice.cancelled_at = timezone.now()
    invoice.cancel_reason = reason
    invoice.reversal_journal_entry = reversal_journal
    invoice.save(
        update_fields=[
            "status",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "reversal_journal_entry",
            "updated_at",
        ]
    )
    _log_accounting_event(
        event="ACCOUNTING_TAX_INVOICE_CANCELLED",
        instance=invoice,
        performed_by=performed_by,
        metadata={
            "invoice_no": invoice.invoice_no,
            "reason": reason,
            "reversal_journal_entry_id": reversal_journal.id,
        },
    )
    return invoice, True


@transaction.atomic
def cancel_credit_note(*, credit_note_id: int, performed_by, reason: str):
    note = CreditNote.objects.select_for_update().get(pk=credit_note_id)
    if note.status == TaxDocumentStatus.CANCELLED:
        return note, False
    if note.status != TaxDocumentStatus.POSTED:
        raise ValueError("Only posted credit notes can be cancelled.")

    reason = _strip_reason(reason)
    accounts = ensure_gst_system_accounts()
    reversal_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="GST_CREDIT_NOTE_CANCEL",
        entry_date=timezone.localdate(),
        memo=f"Cancellation of credit note {note.note_no or note.id}",
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
                "description": f"GST cancel {note.note_no or note.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": note.tax_adjustment,
            },
        ],
        posted_by=performed_by,
    )
    note.status = TaxDocumentStatus.CANCELLED
    note.cancelled_by = performed_by
    note.cancelled_at = timezone.now()
    note.cancel_reason = reason
    note.reversal_journal_entry = reversal_journal
    note.save(
        update_fields=[
            "status",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "reversal_journal_entry",
            "updated_at",
        ]
    )
    _log_accounting_event(
        event="ACCOUNTING_CREDIT_NOTE_CANCELLED",
        instance=note,
        performed_by=performed_by,
        metadata={
            "note_no": note.note_no,
            "reason": reason,
            "reversal_journal_entry_id": reversal_journal.id,
        },
    )
    return note, True


@transaction.atomic
def cancel_debit_note(*, debit_note_id: int, performed_by, reason: str):
    note = DebitNote.objects.select_for_update().get(pk=debit_note_id)
    if note.status == TaxDocumentStatus.CANCELLED:
        return note, False
    if note.status != TaxDocumentStatus.POSTED:
        raise ValueError("Only posted debit notes can be cancelled.")

    reason = _strip_reason(reason)
    accounts = ensure_gst_system_accounts()
    reversal_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="GST_DEBIT_NOTE_CANCEL",
        entry_date=timezone.localdate(),
        memo=f"Cancellation of debit note {note.note_no or note.id}",
        lines=[
            {
                "chart_account": accounts["SALES_REVENUE"],
                "description": note.note_no or str(note.id),
                "debit_amount": note.taxable_adjustment,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST cancel {note.note_no or note.id}",
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
        posted_by=performed_by,
    )
    note.status = TaxDocumentStatus.CANCELLED
    note.cancelled_by = performed_by
    note.cancelled_at = timezone.now()
    note.cancel_reason = reason
    note.reversal_journal_entry = reversal_journal
    note.save(
        update_fields=[
            "status",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "reversal_journal_entry",
            "updated_at",
        ]
    )
    _log_accounting_event(
        event="ACCOUNTING_DEBIT_NOTE_CANCELLED",
        instance=note,
        performed_by=performed_by,
        metadata={
            "note_no": note.note_no,
            "reason": reason,
            "reversal_journal_entry_id": reversal_journal.id,
        },
    )
    return note, True
