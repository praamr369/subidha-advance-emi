from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from billing.models import BillingDocumentStatus, BillingInvoice
from reminders.models import ReminderChannel, ReminderStatus, ReminderType
from reminders.services.reminder_service import create_payment_reminder
from subscriptions.models import Emi, EmiStatus


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _existing_invoice_reminder(invoice: BillingInvoice, reminder_type: str) -> bool:
    return invoice.payment_reminders.filter(reminder_type=reminder_type).exists()


def _existing_emi_reminder(emi: Emi, reminder_type: str) -> bool:
    return emi.subscription.payment_reminders.filter(
        target_payment__isnull=True,
        reminder_type=reminder_type,
        due_date=emi.due_date,
        amount_due=emi.amount,
    ).exists()


@transaction.atomic
def generate_payment_reminders(*, due_date_on_or_before: date | None = None, performed_by=None):
    effective_due_date = due_date_on_or_before or date.today()
    created_count = 0
    skipped_count = 0

    invoice_queryset = BillingInvoice.objects.select_related("customer").filter(
        status=BillingDocumentStatus.POSTED,
        balance_total__gt=Decimal("0.00"),
        invoice_date__lte=effective_due_date,
    )
    for invoice in invoice_queryset:
        if _existing_invoice_reminder(invoice, ReminderType.RETAIL_DUE):
            skipped_count += 1
            continue
        create_payment_reminder(
            performed_by=performed_by,
            channel=ReminderChannel.INTERNAL,
            reminder_type=ReminderType.RETAIL_DUE,
            target_customer=invoice.customer,
            target_invoice=invoice,
            due_date=invoice.invoice_date,
            amount_due=_money(invoice.balance_total),
            status=ReminderStatus.PENDING,
            notes=f"Generated from billing invoice {invoice.document_no or invoice.id}",
            template_key="RETAIL_DUE",
        )
        created_count += 1

    emi_queryset = Emi.objects.select_related("subscription", "subscription__customer").filter(
        status=EmiStatus.PENDING,
        due_date__lte=effective_due_date,
    )
    for emi in emi_queryset:
        reminder_type = ReminderType.EMI_OVERDUE if emi.is_overdue() else ReminderType.EMI_DUE
        if _existing_emi_reminder(emi, reminder_type):
            skipped_count += 1
            continue
        create_payment_reminder(
            performed_by=performed_by,
            channel=ReminderChannel.INTERNAL,
            reminder_type=reminder_type,
            target_customer=emi.subscription.customer,
            target_subscription=emi.subscription,
            due_date=emi.due_date,
            amount_due=_money(emi.amount),
            status=ReminderStatus.PENDING,
            notes=f"Generated from EMI {emi.id}",
            template_key=reminder_type,
        )
        created_count += 1

    return {
        "due_date_on_or_before": effective_due_date.isoformat(),
        "created_count": created_count,
        "skipped_count": skipped_count,
    }
