from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.commission_service import (
    create_commission_for_payment,
    reverse_commission_for_payment,
)
from subscriptions.services.subscription_status_service import (
    resolve_expected_subscription_status,
)
from services.payments.allocate_payment import allocate_payment


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid decimal value.")


def _normalize_amount(value) -> Decimal:
    amount = _to_decimal(value)
    if amount <= MONEY_ZERO:
        raise ValueError("Payment amount must be greater than zero.")
    return amount


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_role(user) -> str:
    return getattr(user, "role", "") if user else ""


def _safe_enum_value(value):
    return getattr(value, "value", value)


def _assert_payment_write_allowed(subscription: Subscription, emi: Emi):
    subscription_status = _safe_enum_value(getattr(subscription, "status", None))
    emi_status = _safe_enum_value(getattr(emi, "status", None))

    blocked_subscription_statuses = {
        _safe_enum_value(getattr(SubscriptionStatus, "COMPLETED", "COMPLETED")),
        _safe_enum_value(getattr(SubscriptionStatus, "DEFAULTED", "DEFAULTED")),
        "COMPLETED",
        "DEFAULTED",
        "CANCELLED",
    }

    if subscription_status in blocked_subscription_statuses:
        raise ValueError(
            f"Cannot collect payment for a {str(subscription_status).lower()} subscription."
        )

    waived_status = _safe_enum_value(getattr(EmiStatus, "WAIVED", "WAIVED"))
    paid_status = _safe_enum_value(getattr(EmiStatus, "PAID", "PAID"))

    if emi_status == waived_status:
        raise ValueError("Cannot collect payment for a waived EMI.")

    if emi_status == paid_status:
        raise ValueError("This EMI is already fully paid.")


def _find_existing_reference(reference_no: Optional[str]) -> Optional[Payment]:
    if not reference_no:
        return None

    return (
        Payment.objects.select_related("emi", "subscription", "customer")
        .filter(reference_no=reference_no)
        .first()
    )


def _create_audit_log(
    *,
    action_type,
    performed_by,
    object_id,
    metadata: Optional[dict] = None,
    model_name: str = "payment",
):
    AuditLog.objects.create(
        action_type=action_type,
        performed_by=performed_by,
        model_name=model_name,
        object_id=object_id,
        metadata=metadata or {},
    )


def _create_ledger_entry(
    *,
    emi: Emi,
    payment,
    entry_type,
    amount: Decimal,
    entry_direction: str,
    allocation_context: Optional[dict] = None,
):
    FinancialLedger.objects.create(
        emi=emi,
        payment=payment,
        entry_type=entry_type,
        entry_direction=entry_direction,
        amount=amount,
        allocation_context=allocation_context or {},
    )


def _get_emi_net_paid(emi: Emi) -> Decimal:
    payment_total = (
        FinancialLedger.objects.filter(
            emi=emi,
            entry_type=LedgerEntryType.EMI_PAYMENT,
        ).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )

    reversal_total = (
        FinancialLedger.objects.filter(
            emi=emi,
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        ).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )

    net_paid = Decimal(str(payment_total)) - Decimal(str(reversal_total))
    if net_paid < MONEY_ZERO:
        return MONEY_ZERO
    return net_paid


def _refresh_emi_status(emi: Emi):
    net_paid = _get_emi_net_paid(emi)

    waived_status = _safe_enum_value(getattr(EmiStatus, "WAIVED", "WAIVED"))
    pending_status = _safe_enum_value(getattr(EmiStatus, "PENDING", "PENDING"))
    partial_status = _safe_enum_value(getattr(EmiStatus, "PARTIAL", "PARTIAL"))
    paid_status = _safe_enum_value(getattr(EmiStatus, "PAID", "PAID"))

    if net_paid >= emi.amount:
        emi.status = paid_status
        if hasattr(emi, "paid_date"):
            emi.paid_date = timezone.now().date()
            emi.save(update_fields=["status", "paid_date"])
        else:
            emi.save(update_fields=["status"])
        return

    if net_paid > MONEY_ZERO:
        # Only use PARTIAL if your EmiStatus enum supports it.
        # If not, keep PENDING as fallback.
        if hasattr(EmiStatus, "PARTIAL"):
            emi.status = partial_status
        else:
            emi.status = pending_status

        if hasattr(emi, "paid_date"):
            emi.paid_date = None
            emi.save(update_fields=["status", "paid_date"])
        else:
            emi.save(update_fields=["status"])
        return

    if _safe_enum_value(getattr(emi, "status", None)) != waived_status:
        emi.status = pending_status

    if hasattr(emi, "paid_date"):
        emi.paid_date = None
        emi.save(update_fields=["status", "paid_date"])
    else:
        emi.save(update_fields=["status"])


def _refresh_subscription_status(subscription: Subscription):
    emis = subscription.emis.all()

    if not emis.exists():
        return

    statuses = {_safe_enum_value(e.status) for e in emis}
    current_status = _safe_enum_value(getattr(subscription, "status", None))
    winner_lucky_status = _safe_enum_value(getattr(LuckyIdStatus, "WON", "WON"))
    is_winner = bool(
        subscription.winner_month is not None
        or current_status == _safe_enum_value(getattr(SubscriptionStatus, "WON", "WON"))
        or _safe_enum_value(getattr(subscription.lucky_id, "status", None))
        == winner_lucky_status
    )
    next_status = resolve_expected_subscription_status(
        current_status=current_status,
        emi_statuses=statuses,
        is_winner=is_winner,
    )

    if current_status != next_status:
        subscription.status = next_status
        subscription.save(update_fields=["status"])


def _reconcile_after_payment(subscription: Subscription, emi: Emi):
    _refresh_emi_status(emi)
    _refresh_subscription_status(subscription)


@transaction.atomic
def record_emi_payment(
    *,
    emi_id: int,
    amount,
    collected_by,
    method: str = "CASH",
    reference_no: Optional[str] = None,
    note: Optional[str] = None,
    payment_date=None,
):
    """
    Canonical payment collection entrypoint.

    Current real-model alignment:
    - Payment model supports: customer, subscription, emi, amount, method,
      reference_no, collected_by, payment_date, allocation_metadata
    - Payment model does NOT support: note/notes/status
    - Reversal is tracked through allocation_metadata + ledger compensation
    """
    amount = _normalize_amount(amount)
    method = (_normalize_text(method) or "CASH").upper()
    reference_no = _normalize_text(reference_no)
    note = _normalize_text(note)  # accepted for API compatibility, not persisted
    payment_date = payment_date or timezone.now().date()

    existing = _find_existing_reference(reference_no)
    if existing:
        if existing.emi_id != emi_id or Decimal(str(existing.amount)) != amount:
            raise ValueError(
                "A payment with this reference number already exists with different details."
            )

        return {
            "payment": existing,
            "emi": existing.emi,
            "subscription": existing.subscription,
            "created": False,
        }

    emi = (
        Emi.objects.select_for_update()
        .select_related("subscription", "subscription__customer")
        .get(id=emi_id)
    )
    subscription = emi.subscription

    _assert_payment_write_allowed(subscription, emi)

    payment = Payment.objects.create(
        customer=subscription.customer,
        subscription=subscription,
        emi=emi,
        amount=amount,
        method=method,
        reference_no=reference_no,
        collected_by=collected_by,
        payment_date=payment_date,
    )

    allocated_amount = allocate_payment(payment)

    _create_ledger_entry(
        emi=emi,
        payment=payment,
        entry_type=LedgerEntryType.EMI_PAYMENT,
        entry_direction="CREDIT",
        amount=amount,
        allocation_context={
            "method": method,
            "reference_no": reference_no,
            "note_accepted_but_not_persisted": note,
        },
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.EMI_PAID,
        performed_by=collected_by,
        object_id=payment.id,
        metadata={
            "payment_id": payment.id,
            "subscription_id": subscription.id,
            "emi_id": emi.id,
            "amount": str(amount),
            "method": method,
            "reference_no": reference_no,
        },
    )

    create_commission_for_payment(
        payment=payment,
        actor=collected_by,
    )

    _reconcile_after_payment(subscription, emi)

    return {
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "allocated_amount": allocated_amount,
        "created": True,
    }


@transaction.atomic
def collect_payment_for_admin(
    *,
    emi=None,
    emi_id: Optional[int] = None,
    amount=None,
    admin_user=None,
    collected_by=None,
    payment_method: Optional[str] = None,
    method: Optional[str] = None,
    payment_date=None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
    note: Optional[str] = None,
):
    """
    Backward-compatible admin wrapper.

    Accepts both old and new argument names:
    - emi or emi_id
    - payment_method or method
    - notes or note
    - admin_user or collected_by
    """
    actor = admin_user or collected_by
    role = _safe_role(actor)

    if not actor:
        raise ValueError("Admin user is required.")

    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise ValueError("Only admin can collect payments from this flow.")

    resolved_emi_id = emi_id or getattr(emi, "id", None)
    if not resolved_emi_id:
        raise ValueError("emi_id is required.")

    resolved_method = method or payment_method or "CASH"
    resolved_note = note if note is not None else notes

    return record_emi_payment(
        emi_id=resolved_emi_id,
        amount=amount,
        collected_by=actor,
        method=resolved_method,
        reference_no=reference_no,
        note=resolved_note,
        payment_date=payment_date,
    )


@transaction.atomic
def verify_payment(*, payment_id: int, verified_by):
    """
    Compatibility helper.

    Current real-model alignment:
    - if verified_by / verified_at fields exist, set them
    - no synthetic payment.status field is assumed
    - avoid select_related + select_for_update outer-join locking issue
    """
    role = _safe_role(verified_by)
    if role != "ADMIN" and not getattr(verified_by, "is_superuser", False):
        raise ValueError("Only admin can verify payments.")

    if not payment_id:
        raise ValueError("payment_id is required.")

    payment = Payment.objects.select_for_update().get(id=payment_id)

    update_fields = []

    if hasattr(payment, "verified_by"):
        payment.verified_by = verified_by
        update_fields.append("verified_by")

    if hasattr(payment, "verified_at"):
        payment.verified_at = timezone.now()
        update_fields.append("verified_at")

    if update_fields:
        payment.save(update_fields=update_fields)

    commission_result = create_commission_for_payment(
        payment=payment,
        actor=verified_by,
    )

    emi = payment.emi
    subscription = payment.subscription

    return {
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "commission": commission_result.get("commission"),
        "commission_created": commission_result.get("created", False),
        "updated": bool(update_fields),
    }


@transaction.atomic
def reverse_payment_for_admin(
    *,
    payment_id: int,
    reversed_by,
    reason: Optional[str] = None,
):
    role = _safe_role(reversed_by)
    if role != "ADMIN" and not getattr(reversed_by, "is_superuser", False):
        raise ValueError("Only admin can reverse payments.")

    if not payment_id:
        raise ValueError("payment_id is required.")

    payment = Payment.objects.select_for_update().get(id=payment_id)

    reason = _normalize_text(reason)

    metadata = dict(getattr(payment, "allocation_metadata", {}) or {})
    reversal = dict(metadata.get("reversal") or {})

    if reversal.get("is_reversed"):
        raise ValueError("Payment is already reversed.")

    reversal.update(
        {
            "is_reversed": True,
            "reason": reason,
            "reversed_by_id": getattr(reversed_by, "id", None),
            "reversed_at": timezone.now().isoformat(),
        }
    )
    metadata["reversal"] = reversal
    payment.allocation_metadata = metadata
    payment.save(update_fields=["allocation_metadata"])

    emi = payment.emi
    subscription = payment.subscription

    _create_ledger_entry(
        emi=emi,
        payment=None,
        entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        entry_direction="DEBIT",
        amount=payment.amount,
        allocation_context={
            "reversed_payment_id": payment.id,
            "reason": reason,
            "reversed_by_id": getattr(reversed_by, "id", None),
        },
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.PAYMENT_RECONCILED,
        performed_by=reversed_by,
        object_id=payment.id,
        metadata={
            "payment_id": payment.id,
            "subscription_id": payment.subscription_id,
            "emi_id": payment.emi_id,
            "amount": str(payment.amount),
            "reason": reason,
        },
    )

    reverse_commission_for_payment(
        payment=payment,
        actor=reversed_by,
        reason=reason,
    )

    _reconcile_after_payment(subscription, emi)

    return {
        "detail": "Payment reversed successfully.",
        "payment": payment,
        "emi": emi,
        "subscription": subscription,
        "updated": True,
    }
