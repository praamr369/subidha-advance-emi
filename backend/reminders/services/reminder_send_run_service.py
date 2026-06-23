from __future__ import annotations

from datetime import date

from django.db import transaction

from reminders.models import PaymentReminder, ReminderStatus
from reminders.services.reminder_generation_service import generate_payment_reminders
from reminders.services.reminder_service import send_payment_reminder


@transaction.atomic
def run_payment_reminders(*, due_date_on_or_before: date | None = None, send_now: bool = False, performed_by=None):
    generation = generate_payment_reminders(
        due_date_on_or_before=due_date_on_or_before,
        performed_by=performed_by,
    )
    sent_count = 0
    skipped_count = 0
    if send_now:
        queryset = PaymentReminder.objects.select_for_update().filter(
            status__in=[ReminderStatus.PENDING, ReminderStatus.SCHEDULED]
        )
        for reminder in queryset:
            reminder, updated = send_payment_reminder(
                reminder_id=reminder.id,
                performed_by=performed_by,
                notes="Sent during reminder run.",
                manual_send=False,
            )
            sent_count += 1 if updated else 0
            skipped_count += 0 if updated else 1

    return {
        **generation,
        "send_now": send_now,
        "sent_count": sent_count,
        "send_skipped_count": skipped_count,
    }
