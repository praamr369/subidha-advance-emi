from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    Commission,
    CommissionStatus,
    EmiStatus,
    MONEY_ZERO,
)


# ------------------------
# Utility helpers
# ------------------------

def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return MONEY_ZERO


def _normalize_reason(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_role(user) -> str:
    return getattr(user, "role", "") if user else ""


def _get_partner_rate(partner) -> Decimal:
    rate = getattr(partner, "commission_rate", MONEY_ZERO)
    rate = _to_decimal(rate)
    return rate if rate > MONEY_ZERO else MONEY_ZERO


def _is_payment_reversed(payment) -> bool:
    metadata = getattr(payment, "allocation_metadata", {}) or {}
    reversal = metadata.get("reversal", {}) or {}
    return bool(reversal.get("is_reversed"))


def _build_commission_metadata(*, payment, partner, rate: Decimal) -> dict:
    return {
        "payment_id": payment.id,
        "subscription_id": payment.subscription_id,
        "emi_id": payment.emi_id,
        "partner_id": getattr(partner, "id", None),
        "commission_rate": str(rate),
        "payment_amount": str(payment.amount),
    }


def _create_audit_log(*, action_type, actor, commission: Commission, metadata=None):
    AuditLog.objects.create(
        action_type=action_type,
        performed_by=actor,
        model_name="commission",
        object_id=commission.id,
        metadata=metadata or {},
    )


# ------------------------
# Commission Creation
# ------------------------

@transaction.atomic
def create_commission_for_payment(*, payment, actor=None):
    if not payment:
        raise ValueError("payment is required.")

    existing = Commission.objects.filter(payment=payment).first()
    if existing:
        if existing.status == CommissionStatus.REVERSED:
            return {"commission": existing, "created": False}
        return {"commission": existing, "created": False}

    subscription = getattr(payment, "subscription", None)
    if not subscription:
        return {"commission": None, "created": False}

    partner = getattr(subscription, "partner", None)
    if not partner or _safe_role(partner) != "PARTNER":
        return {"commission": None, "created": False}

    emi = getattr(payment, "emi", None)
    if emi and getattr(emi, "status", None) == EmiStatus.WAIVED:
        return {"commission": None, "created": False}

    if _is_payment_reversed(payment):
        return {"commission": None, "created": False}

    rate = _get_partner_rate(partner)
    if rate <= MONEY_ZERO:
        return {"commission": None, "created": False}

    payment_amount = _to_decimal(payment.amount)
    commission_amount = (
        payment_amount * rate / Decimal("100.00")
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    commission = Commission.objects.create(
        partner=partner,
        subscription=subscription,
        payment=payment,
        emi=payment.emi,
        commission_rate=rate,
        commission_amount=commission_amount,
        status=CommissionStatus.PENDING,
        metadata=_build_commission_metadata(
            payment=payment,
            partner=partner,
            rate=rate,
        ),
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.COMMISSION_CREATED,
        actor=actor,
        commission=commission,
        metadata={
            "commission_id": commission.id,
            "payment_id": payment.id,
            "partner_id": partner.id,
            "commission_amount": str(commission_amount),
        },
    )

    return {"commission": commission, "created": True}


# ------------------------
# Commission Reversal
# ------------------------

@transaction.atomic
def reverse_commission_for_payment(*, payment, actor=None, reason=None):
    if not payment:
        raise ValueError("payment is required.")

    commission = Commission.objects.filter(payment=payment).first()
    if not commission:
        return {"commission": None, "updated": False}

    if commission.status == CommissionStatus.REVERSED:
        return {"commission": commission, "updated": False}

    normalized_reason = _normalize_reason(reason)

    metadata = dict(commission.metadata or {})
    metadata["reversal"] = {
        "reason": normalized_reason,
        "source_payment_id": getattr(payment, "id", None),
        "reversed_at": timezone.now().isoformat(),
        "reversed_by_id": getattr(actor, "id", None),
    }

    commission.status = CommissionStatus.REVERSED
    commission.reversal_reason = normalized_reason
    commission.metadata = metadata

    commission.save(
        update_fields=["status", "reversal_reason", "metadata", "updated_at"]
    )

    _create_audit_log(
        action_type=AuditLog.ActionType.PAYMENT_RECONCILED,
        actor=actor,
        commission=commission,
        metadata={"reason": normalized_reason},
    )

    return {"commission": commission, "updated": True}


# ------------------------
# Commission Settlement (Phase A)
# ------------------------

@transaction.atomic
def settle_commission(
    *,
    commission_id: int,
    settled_by=None,
    settlement_date=None,
    settlement_metadata: dict | None = None,
):
    if not commission_id:
        raise ValueError("commission_id is required.")

    try:
        commission = Commission.objects.select_for_update().get(id=commission_id)
    except Commission.DoesNotExist:
        raise ValueError("Commission not found.")

    # Block invalid states
    if commission.status == CommissionStatus.REVERSED:
        raise ValueError("Reversed commission cannot be settled.")

    # Idempotent safe return
    if commission.status == CommissionStatus.SETTLED:
        return {"commission": commission, "updated": False}

    if commission.status != CommissionStatus.PENDING:
        raise ValueError(f"Invalid state: {commission.status}")

    commission.status = CommissionStatus.SETTLED
    commission.settlement_date = settlement_date or timezone.now().date()

    metadata = dict(commission.metadata or {})
    metadata["settlement"] = {
        "settled_at": timezone.now().isoformat(),
        "settled_by_id": getattr(settled_by, "id", None),
    }
    if settlement_metadata:
        metadata["settlement"].update(settlement_metadata)
    commission.metadata = metadata

    commission.save(
        update_fields=["status", "settlement_date", "metadata", "updated_at"]
    )

    # ✅ FIXED: correct audit type
    _create_audit_log(
        action_type=AuditLog.ActionType.COMMISSION_SETTLED,
        actor=settled_by,
        commission=commission,
        metadata={
            "commission_id": commission.id,
            "actor_id": getattr(settled_by, "id", None),
            "settlement_date": str(commission.settlement_date),
            **(settlement_metadata or {}),
        },
    )

    return {"commission": commission, "updated": True}
