"""Click-to-send WhatsApp outbox.

Every customer-facing event (receipt, delivery update, draw result, KYC
decision, contract activation, due reminder) queues a pre-filled message here.
Staff open it in their own WhatsApp through a wa.me link and tap Send, then
confirm it was sent. Nothing is sent automatically: wa.me cannot send on its
own, and unofficial automation of WhatsApp breaks its terms and gets business
numbers banned.

Queueing is always best-effort. A missing phone number, a template problem, or
a database hiccup must never break the payment, delivery, or draw that
triggered it, so every public entry point swallows its own errors.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from urllib.parse import quote

from django.db import IntegrityError, transaction
from django.utils import timezone

from reminders.models import WhatsAppEventType, WhatsAppMessage, WhatsAppMessageStatus

logger = logging.getLogger(__name__)

DEFAULT_COMPANY = "Subidha Furniture"

TEMPLATES: dict[str, str] = {
    WhatsAppEventType.PAYMENT_RECEIPT: (
        "Dear {name}, we have received your payment of ₹{amount} on {date} for {ref}. "
        "Receipt: {receipt}. Thank you for paying on time. — {company}"
    ),
    WhatsAppEventType.DUE_REMINDER: (
        "Dear {name}, your {plan_label} instalment of ₹{amount} for {ref} is due on {date}. "
        "Please pay on time to keep your plan in good standing. — {company}"
    ),
    WhatsAppEventType.DELIVERY_SCHEDULED: (
        "Dear {name}, delivery of your {product} ({ref}) is scheduled for {date}. "
        "Our team will call before arriving. — {company}"
    ),
    WhatsAppEventType.OUT_FOR_DELIVERY: (
        "Dear {name}, your {product} ({ref}) is out for delivery today. "
        "Please keep your phone reachable. — {company}"
    ),
    WhatsAppEventType.DELIVERED: (
        "Dear {name}, your {product} ({ref}) has been delivered. "
        "Thank you for choosing us. For any issue, reply to this chat. — {company}"
    ),
    WhatsAppEventType.HANDOVER_RETURNED: (
        "Dear {name}, we have received back the {product} from your rental {ref}. "
        "Your security deposit settlement will follow after inspection. — {company}"
    ),
    WhatsAppEventType.DRAW_WINNER: (
        "Congratulations {name}! Your plan {ref} has won the lucky draw for month {month}. "
        "Your remaining instalments are waived as per scheme rules. Our team will contact you. — {company}"
    ),
    WhatsAppEventType.KYC_VERIFIED: (
        "Dear {name}, your KYC documents are verified. Your account is ready. — {company}"
    ),
    WhatsAppEventType.KYC_REJECTED: (
        "Dear {name}, we could not verify your KYC documents ({reason}). "
        "Please share clear copies so we can continue. — {company}"
    ),
    WhatsAppEventType.CONTRACT_ACTIVATED: (
        "Dear {name}, your {plan_label} contract {ref} for {product} is now active. "
        "Monthly amount: ₹{amount}. — {company}"
    ),
    WhatsAppEventType.CUSTOM: "{text}",
}

PLAN_LABELS = {"EMI": "Advance EMI", "RENT": "rent", "LEASE": "lease"}


class _SafeDict(dict):
    """format_map helper: an unknown placeholder renders as a dash, never KeyError."""

    def __missing__(self, key):
        return "—"


def normalize_phone_e164(raw: str | None) -> str:
    """E.164 without '+'. Bare 10-digit numbers are Indian mobiles, so prefix 91."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    return digits


def company_name() -> str:
    try:
        from business_setup.models import BusinessProfile

        profile = BusinessProfile.objects.filter(is_active=True).order_by("id").first()
    except Exception:  # pragma: no cover - profile table missing in odd setups
        profile = None
    if profile is None:
        return DEFAULT_COMPANY
    for attr in ("display_name", "trade_name", "business_name", "legal_name", "name"):
        value = (getattr(profile, attr, "") or "").strip()
        if value:
            return value
    return DEFAULT_COMPANY


def _money(value) -> str:
    try:
        return f"{Decimal(str(value)):,.2f}"
    except Exception:
        return str(value or "0")


def _contract_ref(subscription) -> str:
    if subscription is None:
        return "your account"
    return (
        getattr(subscription, "subscription_number", "")
        or getattr(subscription, "contract_reference", "")
        or f"#{subscription.pk}"
    )


def render_message(event_type: str, context: dict) -> str:
    template = TEMPLATES.get(event_type) or TEMPLATES[WhatsAppEventType.CUSTOM]
    values = _SafeDict(context)
    values.setdefault("company", company_name())
    values.setdefault("name", "Customer")
    return template.format_map(values).strip()


def build_wa_me_link(phone_e164: str, body: str) -> str:
    return f"https://wa.me/{phone_e164}?text={quote(body)}"


def queue_whatsapp_message(
    *,
    event_type: str,
    customer=None,
    subscription=None,
    context: dict | None = None,
    source_model: str = "",
    source_id: str | int = "",
    dedupe_key: str | None = None,
    phone: str | None = None,
) -> WhatsAppMessage | None:
    """Queue one message. Returns None (never raises) when it cannot be queued."""
    try:
        if customer is None and subscription is not None:
            customer = getattr(subscription, "customer", None)
        raw_phone = phone or getattr(customer, "phone", "") or ""
        phone_e164 = normalize_phone_e164(raw_phone)
        if len(phone_e164) < 11:
            return None

        ctx = dict(context or {})
        ctx.setdefault("name", getattr(customer, "name", "") or "Customer")
        if subscription is not None:
            ctx.setdefault("ref", _contract_ref(subscription))
            ctx.setdefault("plan_label", PLAN_LABELS.get(str(subscription.plan_type), "plan"))
            ctx.setdefault("product", getattr(getattr(subscription, "product", None), "name", "") or "your product")
        body = render_message(event_type, ctx)

        if dedupe_key:
            existing = WhatsAppMessage.objects.filter(dedupe_key=dedupe_key).first()
            if existing:
                return existing
        with transaction.atomic():
            return WhatsAppMessage.objects.create(
                event_type=event_type,
                customer=customer,
                subscription=subscription,
                phone=raw_phone,
                phone_e164=phone_e164,
                body=body,
                opted_in_snapshot=bool(getattr(customer, "whatsapp_opted_in", False)),
                source_model=source_model,
                source_id=str(source_id or ""),
                dedupe_key=dedupe_key,
            )
    except IntegrityError:
        # Lost a dedupe race to a concurrent writer: the message already exists.
        return WhatsAppMessage.objects.filter(dedupe_key=dedupe_key).first() if dedupe_key else None
    except Exception:  # pragma: no cover - outbox must never break its caller
        logger.exception("WhatsApp outbox queue failed for %s", event_type)
        return None


# ── staff actions ───────────────────────────────────────────────────────────


def open_message(*, message: WhatsAppMessage, performed_by=None) -> dict:
    if message.status == WhatsAppMessageStatus.SKIPPED:
        raise ValueError("This message was skipped. Re-queue it before sending.")
    if not message.phone_e164:
        raise ValueError("No WhatsApp number on file for this customer.")
    if message.status == WhatsAppMessageStatus.QUEUED:
        message.status = WhatsAppMessageStatus.OPENED
        message.opened_at = timezone.now()
        message.opened_by = performed_by
        message.save(update_fields=["status", "opened_at", "opened_by", "updated_at"])
    return {
        "id": message.pk,
        "link": build_wa_me_link(message.phone_e164, message.body),
        "phone_e164": message.phone_e164,
        "body": message.body,
        "status": message.status,
    }


def mark_sent(*, message: WhatsAppMessage, performed_by=None) -> WhatsAppMessage:
    if message.status == WhatsAppMessageStatus.SENT:
        return message
    if message.status == WhatsAppMessageStatus.SKIPPED:
        raise ValueError("A skipped message cannot be marked as sent.")
    message.status = WhatsAppMessageStatus.SENT
    message.sent_at = timezone.now()
    message.sent_by = performed_by
    message.save(update_fields=["status", "sent_at", "sent_by", "updated_at"])
    return message


def skip_message(*, message: WhatsAppMessage, performed_by=None, reason: str = "") -> WhatsAppMessage:
    if message.status == WhatsAppMessageStatus.SENT:
        raise ValueError("This message was already sent and cannot be skipped.")
    message.status = WhatsAppMessageStatus.SKIPPED
    message.skip_reason = (reason or "Skipped by staff").strip()[:240]
    message.save(update_fields=["status", "skip_reason", "updated_at"])
    return message


# ── event helpers (each one best-effort) ────────────────────────────────────


def queue_payment_receipt(payment) -> WhatsAppMessage | None:
    try:
        subscription = getattr(payment, "subscription", None)
        return queue_whatsapp_message(
            event_type=WhatsAppEventType.PAYMENT_RECEIPT,
            customer=getattr(payment, "customer", None),
            subscription=subscription,
            context={
                "amount": _money(payment.amount),
                "date": payment.payment_date.strftime("%d %b %Y") if payment.payment_date else "today",
                "receipt": (payment.reference_no or f"PAY-{payment.pk}"),
            },
            source_model="Payment",
            source_id=payment.pk,
            dedupe_key=f"payment-receipt:{payment.pk}",
        )
    except Exception:  # pragma: no cover
        logger.exception("WhatsApp receipt queue failed")
        return None


_DELIVERY_EVENT_BY_STATUS = {
    "SCHEDULED": WhatsAppEventType.DELIVERY_SCHEDULED,
    "OUT_FOR_DELIVERY": WhatsAppEventType.OUT_FOR_DELIVERY,
    "DELIVERED": WhatsAppEventType.DELIVERED,
    "RETURNED": WhatsAppEventType.HANDOVER_RETURNED,
}


def queue_delivery_update(delivery) -> WhatsAppMessage | None:
    try:
        event_type = _DELIVERY_EVENT_BY_STATUS.get(str(getattr(delivery, "status", "")))
        if event_type is None:
            return None
        scheduled = getattr(delivery, "scheduled_date", None)
        return queue_whatsapp_message(
            event_type=event_type,
            subscription=delivery.subscription,
            context={"date": scheduled.strftime("%d %b %Y") if scheduled else "the agreed date"},
            source_model="SubscriptionDelivery",
            source_id=delivery.pk,
            dedupe_key=f"delivery:{delivery.pk}:{delivery.status}",
        )
    except Exception:  # pragma: no cover
        logger.exception("WhatsApp delivery queue failed")
        return None


def queue_draw_winner(*, subscription, draw_month) -> WhatsAppMessage | None:
    try:
        return queue_whatsapp_message(
            event_type=WhatsAppEventType.DRAW_WINNER,
            subscription=subscription,
            context={"month": draw_month},
            source_model="Subscription",
            source_id=subscription.pk,
            dedupe_key=f"draw-winner:{subscription.pk}:{draw_month}",
        )
    except Exception:  # pragma: no cover
        logger.exception("WhatsApp winner queue failed")
        return None


def queue_kyc_decision(*, customer, verified: bool, reason: str = "") -> WhatsAppMessage | None:
    try:
        event_type = WhatsAppEventType.KYC_VERIFIED if verified else WhatsAppEventType.KYC_REJECTED
        stamp = timezone.now().strftime("%Y%m%d%H%M")
        return queue_whatsapp_message(
            event_type=event_type,
            customer=customer,
            context={"reason": (reason or "documents unclear").strip()},
            source_model="Customer",
            source_id=customer.pk,
            dedupe_key=f"kyc:{customer.pk}:{event_type}:{stamp}",
        )
    except Exception:  # pragma: no cover
        logger.exception("WhatsApp KYC queue failed")
        return None


def queue_contract_activated(subscription) -> WhatsAppMessage | None:
    try:
        return queue_whatsapp_message(
            event_type=WhatsAppEventType.CONTRACT_ACTIVATED,
            subscription=subscription,
            context={"amount": _money(getattr(subscription, "monthly_amount", 0))},
            source_model="Subscription",
            source_id=subscription.pk,
            dedupe_key=f"contract-activated:{subscription.pk}",
        )
    except Exception:  # pragma: no cover
        logger.exception("WhatsApp contract queue failed")
        return None
