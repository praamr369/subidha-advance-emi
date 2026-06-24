from __future__ import annotations

from urllib.parse import quote

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from reminders.models import PaymentReminder, ReminderChannel, ReminderStatus, ReminderType
from reminders.services.gateway_service import ReminderGatewayError, dispatch_gateway_message
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


def _dispatch_email_reminder(reminder: PaymentReminder) -> None:
    """Dispatch a reminder via Django email backend. Raises on delivery failure."""
    customer = reminder.target_customer
    recipient = (reminder.customer_contact or "").strip()
    if not recipient and customer:
        recipient = getattr(customer, "email", "") or ""
    if not recipient:
        raise ValueError("No email address on file for this reminder. Set customer_contact (email) before sending.")

    subject_map = {
        ReminderType.EMI_DUE: "EMI Due Reminder",
        ReminderType.EMI_OVERDUE: "EMI Overdue — Immediate Action Required",
        ReminderType.RENT_DUE: "Rental Instalment Due Reminder",
        ReminderType.RETAIL_DUE: "Payment Due Reminder",
        ReminderType.FOLLOWUP: "Payment Follow-Up",
    }
    subject = f"[SUBIDHA] {subject_map.get(reminder.reminder_type, 'Payment Reminder')}"
    body = _format_whatsapp_message(reminder)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@subidha.in")
    send_mail(subject, body, from_email, [recipient], fail_silently=False)


@transaction.atomic
def send_payment_reminder(
    *,
    reminder_id: int,
    performed_by=None,
    notes: str = "",
    manual_send: bool = True,
):
    reminder = PaymentReminder.objects.select_for_update().get(pk=reminder_id)
    if reminder.status == ReminderStatus.SENT:
        return reminder, False
    if reminder.status == ReminderStatus.CANCELLED:
        raise ValueError("Cancelled reminders cannot be sent.")
    dispatch_mode = "MANUAL_CONFIRM" if manual_send else "AUTOMATED_DISPATCH"
    # For EMAIL/SMS/WHATSAPP automated channels: attempt delivery before marking SENT.
    if reminder.channel == ReminderChannel.EMAIL:
        try:
            _dispatch_email_reminder(reminder)
        except Exception as exc:
            reminder.status = ReminderStatus.FAILED
            reminder.attempts = (reminder.attempts or 0) + 1
            reminder.last_error = str(exc)[:500]
            reminder.save(update_fields=["status", "attempts", "last_error", "updated_at"])
            _audit(
                reminder=reminder,
                performed_by=performed_by,
                event="PAYMENT_REMINDER_FAILED",
                metadata={
                    "error": str(exc)[:200],
                    "attempt": reminder.attempts,
                    "manual_send": manual_send,
                    "dispatch_mode": dispatch_mode,
                },
            )
            raise ValueError(f"Email delivery failed: {exc}") from exc
    elif not manual_send and reminder.channel in {ReminderChannel.SMS, ReminderChannel.WHATSAPP}:
        try:
            gateway_result = dispatch_gateway_message(
                reminder=reminder,
                message=_format_whatsapp_message(reminder),
            )
        except ReminderGatewayError as exc:
            reminder.status = ReminderStatus.FAILED
            reminder.attempts = (reminder.attempts or 0) + 1
            reminder.last_error = str(exc)[:500]
            reminder.save(update_fields=["status", "attempts", "last_error", "updated_at"])
            _audit(
                reminder=reminder,
                performed_by=performed_by,
                event="PAYMENT_REMINDER_FAILED",
                metadata={
                    "error": str(exc)[:200],
                    "attempt": reminder.attempts,
                    "manual_send": manual_send,
                    "dispatch_mode": dispatch_mode,
                    "channel": reminder.channel,
                },
            )
            raise ValueError(f"{reminder.channel} delivery failed: {exc}") from exc
        if not gateway_result.get("accepted"):
            raise ValueError(f"{reminder.channel} gateway did not accept the message.")
        if notes:
            notes = f"{notes.strip()}\nGateway: {gateway_result}".strip()

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
        metadata={
            "reminder_id": reminder.id,
            "channel": reminder.channel,
            "manual_send": manual_send,
            "dispatch_mode": dispatch_mode,
        },
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


MAX_RETRY_ATTEMPTS = 3


@transaction.atomic
def retry_failed_reminder(*, reminder_id: int, performed_by=None):
    """Retry a FAILED reminder. Email only — non-email channels require manual resend. Returns (reminder, retried_bool)."""
    reminder = PaymentReminder.objects.select_for_update().get(pk=reminder_id)
    if reminder.status != ReminderStatus.FAILED:
        raise ValueError("Only FAILED reminders can be retried.")
    if reminder.channel != ReminderChannel.EMAIL:
        raise ValueError(f"Retry is only supported for EMAIL channel. {reminder.channel} requires manual resend.")
    if (reminder.attempts or 0) >= MAX_RETRY_ATTEMPTS:
        raise ValueError(f"Maximum retry attempts ({MAX_RETRY_ATTEMPTS}) reached. Create a new reminder instead.")

    try:
        _dispatch_email_reminder(reminder)
    except Exception as exc:
        reminder.attempts = (reminder.attempts or 0) + 1
        reminder.last_error = str(exc)[:500]
        reminder.save(update_fields=["attempts", "last_error", "updated_at"])
        _audit(
            reminder=reminder,
            performed_by=performed_by,
            event="PAYMENT_REMINDER_RETRY_FAILED",
            metadata={"error": str(exc)[:200], "attempt": reminder.attempts},
        )
        raise ValueError(f"Retry failed: {exc}") from exc

    reminder.status = ReminderStatus.SENT
    reminder.sent_at = timezone.now()
    reminder.sent_by = performed_by
    reminder.attempts = (reminder.attempts or 0) + 1
    reminder.last_error = ""
    reminder.save(update_fields=["status", "sent_at", "sent_by", "attempts", "last_error", "updated_at"])
    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="PAYMENT_REMINDER_RETRIED",
        metadata={"reminder_id": reminder.id, "attempt": reminder.attempts},
    )
    return reminder, True


def generate_whatsapp_link(*, reminder_id: int, performed_by=None) -> dict:
    """
    Generate a wa.me deep-link for manual WhatsApp sending.

    Staff click this link to open WhatsApp Web / the app with a pre-filled message.
    Delivery is NOT automated — staff must send manually. Call the send action after
    confirming to record the manual send in the audit log.
    """
    reminder = PaymentReminder.objects.select_related(
        "target_customer", "target_subscription"
    ).get(pk=reminder_id)

    if reminder.status in {ReminderStatus.SENT, ReminderStatus.CANCELLED}:
        raise ValueError(f"Cannot generate WhatsApp link for {reminder.status} reminders.")

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

    _audit(
        reminder=reminder,
        performed_by=performed_by,
        event="WHATSAPP_LINK_OPENED",
        metadata={
            "reminder_id": reminder.id,
            "channel": reminder.channel,
            "manual_send": True,
            "dispatch_mode": "MANUAL_CONFIRM",
        },
    )

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
