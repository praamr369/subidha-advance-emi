from __future__ import annotations

from datetime import date
from decimal import Decimal

from reminders.models import ReminderChannel, ReminderStatus, ReminderType
from reminders.services.reminder_service import create_payment_reminder
from subscriptions.models import Emi, EmiStatus


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _existing_emi_reminder(*, emi: Emi, reminder_type: str) -> bool:
    return emi.subscription.payment_reminders.filter(
        target_payment__isnull=True,
        reminder_type=reminder_type,
        due_date=emi.due_date,
        amount_due=emi.amount,
    ).exists()


def generate_emi_due_reminders_for_date(*, on_date: date, performed_by=None) -> dict:
    """Pending EMIs due exactly on ``on_date`` that are not yet overdue."""
    created = 0
    skipped = 0
    qs = Emi.objects.select_related("subscription", "subscription__customer").filter(
        status=EmiStatus.PENDING,
        due_date=on_date,
    )
    for emi in qs:
        if emi.is_overdue():
            skipped += 1
            continue
        if _existing_emi_reminder(emi=emi, reminder_type=ReminderType.EMI_DUE):
            skipped += 1
            continue
        create_payment_reminder(
            performed_by=performed_by,
            channel=ReminderChannel.INTERNAL,
            reminder_type=ReminderType.EMI_DUE,
            target_customer=emi.subscription.customer,
            target_subscription=emi.subscription,
            due_date=emi.due_date,
            amount_due=_money(emi.amount),
            status=ReminderStatus.PENDING,
            notes=f"Generated from EMI {emi.id} (due {emi.due_date})",
            template_key=ReminderType.EMI_DUE,
        )
        created += 1
    return {"on_date": on_date.isoformat(), "created_count": created, "skipped_count": skipped}


def generate_emi_overdue_reminders(*, as_of: date, performed_by=None) -> dict:
    created = 0
    skipped = 0
    qs = Emi.objects.select_related("subscription", "subscription__customer").filter(
        status=EmiStatus.PENDING,
        due_date__lt=as_of,
    )
    for emi in qs:
        if not emi.is_overdue():
            skipped += 1
            continue
        if _existing_emi_reminder(emi=emi, reminder_type=ReminderType.EMI_OVERDUE):
            skipped += 1
            continue
        create_payment_reminder(
            performed_by=performed_by,
            channel=ReminderChannel.INTERNAL,
            reminder_type=ReminderType.EMI_OVERDUE,
            target_customer=emi.subscription.customer,
            target_subscription=emi.subscription,
            due_date=emi.due_date,
            amount_due=_money(emi.amount),
            status=ReminderStatus.PENDING,
            notes=f"Generated overdue EMI {emi.id}",
            template_key=ReminderType.EMI_OVERDUE,
        )
        created += 1
    return {"as_of": as_of.isoformat(), "created_count": created, "skipped_count": skipped}
