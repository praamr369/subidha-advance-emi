from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from reminders.models import PaymentReminder, ReminderStatus
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def _audit(*, reminder, performed_by=None, event: str, metadata: dict | None = None):
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=reminder,
        performed_by=performed_by,
        metadata={"event": event, **(metadata or {})},
    )


@transaction.atomic
def create_payment_reminder(*, performed_by=None, **validated_data):
    if not validated_data.get("customer_contact"):
        customer = validated_data.get("target_customer")
        validated_data["customer_contact"] = getattr(customer, "phone", "") or getattr(customer, "email", "")
    reminder = PaymentReminder.objects.create(**validated_data)
    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="PAYMENT_REMINDER_CREATED",
        metadata={"reminder_id": reminder.id},
    )
    return reminder


@transaction.atomic
def schedule_payment_reminder(*, reminder_id: int, scheduled_for, performed_by=None):
    reminder = PaymentReminder.objects.select_for_update().get(pk=reminder_id)
    if reminder.status in {ReminderStatus.SENT, ReminderStatus.CANCELLED}:
        raise ValueError("Sent or cancelled reminders cannot be rescheduled.")
    reminder.status = ReminderStatus.SCHEDULED
    reminder.scheduled_for = scheduled_for
    reminder.save(update_fields=["status", "scheduled_for", "updated_at"])
    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="PAYMENT_REMINDER_SCHEDULED",
        metadata={"scheduled_for": scheduled_for.isoformat()},
    )
    return reminder, True


@transaction.atomic
def send_payment_reminder(*, reminder_id: int, performed_by=None, notes: str = ""):
    reminder = PaymentReminder.objects.select_for_update().get(pk=reminder_id)
    if reminder.status == ReminderStatus.SENT:
        return reminder, False
    if reminder.status == ReminderStatus.CANCELLED:
        raise ValueError("Cancelled reminders cannot be sent.")
    reminder.status = ReminderStatus.SENT
    reminder.sent_at = timezone.now()
    reminder.sent_by = performed_by
    reminder.attempts = (reminder.attempts or 0) + 1
    if notes:
        reminder.notes = f"{(reminder.notes or '').strip()}\n{notes.strip()}".strip()
    reminder.last_error = ""
    reminder.save(update_fields=["status", "sent_at", "sent_by", "attempts", "notes", "last_error", "updated_at"])
    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="PAYMENT_REMINDER_SENT",
        metadata={"reminder_id": reminder.id},
    )
    return reminder, True


@transaction.atomic
def cancel_payment_reminder(*, reminder_id: int, performed_by=None, notes: str = ""):
    reminder = PaymentReminder.objects.select_for_update().get(pk=reminder_id)
    if reminder.status == ReminderStatus.CANCELLED:
        return reminder, False
    if reminder.status == ReminderStatus.SENT:
        raise ValueError("Sent reminders cannot be cancelled.")
    reminder.status = ReminderStatus.CANCELLED
    if notes:
        reminder.notes = f"{(reminder.notes or '').strip()}\n{notes.strip()}".strip()
    reminder.save(update_fields=["status", "notes", "updated_at"])
    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="PAYMENT_REMINDER_CANCELLED",
        metadata={"reminder_id": reminder.id},
    )
    return reminder, True
