from __future__ import annotations

from urllib.parse import quote

from django.db import transaction
from django.utils import timezone

from reminders.models import PaymentReminder, ReminderStatus, ReminderType
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


# ── WhatsApp manual send support ──────────────────────────────────────────────

_WHATSAPP_TEMPLATES: dict[str, str] = {
    ReminderType.EMI_DUE: (
        "Dear {name}, your EMI of ₹{amount} for subscription {ref} is due on {due_date}. "
        "Please make the payment on time. Thank you — SUBIDHA CORE."
    ),
    ReminderType.EMI_OVERDUE: (
        "Dear {name}, your EMI of ₹{amount} for subscription {ref} was due on {due_date} "
        "and is now overdue. Please clear the outstanding amount immediately. — SUBIDHA CORE."
    ),
    ReminderType.RENT_DUE: (
        "Dear {name}, your rental instalment of ₹{amount} is due on {due_date}. "
        "Please make the payment on time. Thank you — SUBIDHA CORE."
    ),
    ReminderType.RETAIL_DUE: (
        "Dear {name}, a payment of ₹{amount} is due on {due_date}. "
        "Please make the payment on time. Thank you — SUBIDHA CORE."
    ),
    ReminderType.FOLLOWUP: (
        "Dear {name}, this is a follow-up regarding your payment of ₹{amount} due on {due_date}. "
        "Please contact us if you need assistance. — SUBIDHA CORE."
    ),
}

_DEFAULT_WHATSAPP_TEMPLATE = (
    "Dear {name}, a payment of ₹{amount} is due on {due_date}. "
    "Please make the payment on time. Thank you — SUBIDHA CORE."
)


def _format_whatsapp_message(reminder: PaymentReminder) -> str:
    customer = reminder.target_customer
    name = getattr(customer, "name", "Valued Customer") if customer else "Valued Customer"
    amount = f"{reminder.amount_due:.2f}"
    due_date = reminder.due_date.strftime("%d %b %Y") if reminder.due_date else "—"

    subscription = reminder.target_subscription
    if subscription:
        ref = getattr(subscription, "contract_reference", None) or f"#{subscription.id}"
    else:
        ref = "—"

    template = _WHATSAPP_TEMPLATES.get(reminder.reminder_type, _DEFAULT_WHATSAPP_TEMPLATE)
    return template.format(name=name, amount=amount, due_date=due_date, ref=ref)


def generate_whatsapp_link(*, reminder_id: int) -> dict:
    """
    Generate a wa.me deep-link for manual WhatsApp sending.

    Staff click this link to open WhatsApp Web / the app with a pre-filled message.
    Delivery is NOT automated — staff must send manually. Call the send action after
    confirming to record the manual send in the audit log.
    """
    reminder = PaymentReminder.objects.select_related(
        "target_customer", "target_subscription"
    ).get(pk=reminder_id)

    phone = (reminder.customer_contact or "").strip()
    if not phone:
        raise ValueError("No phone number on file for this reminder. Set customer_contact before generating a WhatsApp link.")

    # Normalise to E.164 without '+': strip spaces/dashes, prepend 91 for bare 10-digit Indian numbers.
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        phone_e164 = f"91{digits}"
    else:
        phone_e164 = digits

    if not phone_e164:
        raise ValueError("Invalid phone number format for WhatsApp link generation.")

    message = _format_whatsapp_message(reminder)
    link = f"https://wa.me/{phone_e164}?text={quote(message)}"

    return {
        "reminder_id": reminder.id,
        "phone": phone,
        "phone_e164": phone_e164,
        "message": message,
        "link": link,
        "instructions": (
            "1. Click the link to open WhatsApp with a pre-filled message.\n"
            "2. Review the message and tap Send in WhatsApp.\n"
            "3. Return here and click 'Mark as Sent' to record the manual delivery in the audit log.\n"
            "Delivery is NOT automatic — the system never sends WhatsApp messages on your behalf."
        ),
        "note": (
            "Manual send required. Click the link, send the message in WhatsApp, "
            "then use the 'Mark as Sent' action to record it."
        ),
    }
