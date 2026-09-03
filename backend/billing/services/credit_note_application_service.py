from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from audit.models import AuditLog
from billing.models import (
    BillingCreditNote,
    BillingInvoice,
    CreditNoteApplication,
    CustomerCreditLedger,
    MONEY_ZERO,
)


def _money(val) -> Decimal:
    return Decimal(str(val or 0))


def get_credit_note_available_balance(credit_note_id: int) -> Decimal:
    note = BillingCreditNote.objects.get(pk=credit_note_id)
    applied = (
        CreditNoteApplication.objects.filter(credit_note_id=credit_note_id)
        .aggregate(total=Sum("amount"))
        .get("total")
    ) or MONEY_ZERO
    return _money(note.total_adjustment) - _money(applied)


def get_invoice_outstanding(invoice_id: int) -> Decimal:
    inv = BillingInvoice.objects.get(pk=invoice_id)
    applied_credits = (
        CreditNoteApplication.objects.filter(invoice_id=invoice_id)
        .aggregate(total=Sum("amount"))
        .get("total")
    ) or MONEY_ZERO
    return _money(inv.balance_total) - _money(applied_credits)


@transaction.atomic
def apply_credit_note_to_invoice(
    *,
    credit_note_id: int,
    invoice_id: int,
    amount: Decimal,
    applied_by,
    notes: str = "",
) -> dict:
    if amount <= MONEY_ZERO:
        raise ValueError("Application amount must be positive.")

    note = BillingCreditNote.objects.select_for_update().get(pk=credit_note_id)
    if note.status != "POSTED":
        raise ValueError("Only posted credit notes can be applied.")

    invoice = BillingInvoice.objects.select_for_update().get(pk=invoice_id)
    if invoice.status not in ("APPROVED", "POSTED"):
        raise ValueError("Credit can only be applied to approved or posted invoices.")

    if note.original_invoice.customer_id != invoice.customer_id:
        raise ValueError("Credit note and invoice must belong to the same customer.")

    available = get_credit_note_available_balance(credit_note_id)
    if amount > available:
        raise ValueError(
            f"Amount {amount} exceeds available credit note balance {available}."
        )

    outstanding = get_invoice_outstanding(invoice_id)
    if amount > outstanding:
        raise ValueError(
            f"Amount {amount} exceeds invoice outstanding {outstanding}."
        )

    accounts = ensure_phase3_system_accounts()
    journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="CREDIT_NOTE_APPLICATION",
        entry_date=note.note_date,
        memo=f"Apply CN {note.note_no or note.id} to INV {invoice.document_no or invoice.id}",
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": f"CN {note.note_no or note.id} applied",
                "debit_amount": amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                "description": f"INV {invoice.document_no or invoice.id} offset",
                "debit_amount": Decimal("0.00"),
                "credit_amount": amount,
            },
        ],
        posted_by=applied_by,
    )

    application = CreditNoteApplication.objects.create(
        credit_note=note,
        invoice=invoice,
        amount=amount,
        applied_by=applied_by,
        notes=(notes or "").strip(),
        posted_journal_entry=journal,
    )

    CustomerCreditLedger.objects.create(
        customer_id=invoice.customer_id,
        credit_note=note,
        entry_date=application.applied_date,
        reference_no=f"CNA-{application.id}",
        debit_amount=amount,
        credit_amount=MONEY_ZERO,
        notes=f"Applied CN {note.note_no or note.id} to INV {invoice.document_no or invoice.id}",
        posted_by=applied_by,
    )

    invoice.balance_total = _money(invoice.balance_total) - amount
    invoice.received_total = _money(invoice.received_total) + amount
    invoice.save(update_fields=["balance_total", "received_total", "updated_at"])

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CREDIT_NOTE_APPLIED,
        # AuditLog's columns are performed_by / model_name / object_id. The
        # previous actor / target_type / target_id raised TypeError, so applying
        # a credit note failed at the audit step after the invoice was updated.
        performed_by=applied_by,
        model_name="BillingCreditNote",
        object_id=str(note.id),
        metadata={
            "credit_note_id": note.id,
            "credit_note_no": note.note_no,
            "invoice_id": invoice.id,
            "invoice_no": invoice.document_no,
            "amount": str(amount),
            "application_id": application.id,
            "journal_entry_id": journal.id,
        },
    )

    return {
        "application": application,
        "credit_note": note,
        "invoice": invoice,
        "journal_entry": journal,
    }


def list_credit_note_applications(credit_note_id: int | None = None, invoice_id: int | None = None):
    qs = CreditNoteApplication.objects.select_related(
        "credit_note", "invoice", "applied_by"
    )
    if credit_note_id:
        qs = qs.filter(credit_note_id=credit_note_id)
    if invoice_id:
        qs = qs.filter(invoice_id=invoice_id)
    return qs.order_by("-applied_date", "-id")
