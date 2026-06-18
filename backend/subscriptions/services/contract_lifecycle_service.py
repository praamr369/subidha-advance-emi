"""Contract lifecycle management service.

Handles state transitions: approve, activate, lock terms, cancel, close.
All financial mutations that need to accompany state changes happen here.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.contract_number_service import assign_subscription_number
from subscriptions.services.state_machine import change_subscription_status


def _require_actor(performed_by) -> None:
    if not performed_by:
        raise ValidationError("performed_by is required for contract lifecycle transitions.")


@transaction.atomic
def approve_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract from DRAFT / REQUESTED / PENDING_APPROVAL → APPROVED."""
    _require_actor(performed_by)

    allowed_from = {
        SubscriptionStatus.DRAFT,
        SubscriptionStatus.REQUESTED,
        SubscriptionStatus.PENDING_APPROVAL,
    }
    if subscription.status not in allowed_from:
        raise ValidationError(
            f"Cannot approve a contract in status '{subscription.status}'. "
            f"Expected one of: {', '.join(sorted(allowed_from))}."
        )

    change_subscription_status(subscription, SubscriptionStatus.APPROVED)
    assign_subscription_number(subscription)
    subscription.refresh_from_db(fields=["subscription_number"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_APPROVED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number},
    )
    return subscription


@transaction.atomic
def activate_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract from APPROVED → ACTIVE and lock financial terms."""
    _require_actor(performed_by)

    if subscription.status != SubscriptionStatus.APPROVED:
        raise ValidationError(
            f"Cannot activate a contract in status '{subscription.status}'. Must be APPROVED first."
        )

    _run_activation_gates(subscription)
    # Additive KYC/document readiness gate. No-op unless KYC gating is enabled
    # (and never applies to direct sale). Raises a controlled HTTP 400.
    from subscriptions.services.kyc_readiness_service import enforce_contract_kyc_gate

    enforce_contract_kyc_gate(subscription=subscription, stage="activate")
    from subscriptions.services.contract_activation_readiness_service import (
        assert_contract_activation_ready,
    )

    assert_contract_activation_ready(subscription, stage="activate")
    change_subscription_status(subscription, SubscriptionStatus.ACTIVE)
    _lock_financial_terms(subscription, performed_by)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_ACTIVATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number, "plan_type": subscription.plan_type},
    )
    return subscription


def _run_activation_gates(subscription: Subscription) -> None:
    """Raise ValidationError if contract fails activation prerequisites."""
    errors: dict[str, str] = {}

    if not subscription.customer_id:
        errors["customer"] = "Customer is required before activation."
    if not subscription.product_id:
        errors["product"] = "Product is required before activation."

    if subscription.plan_type == PlanType.EMI:
        if not subscription.batch_id:
            errors["batch"] = "Batch is required for Advance EMI activation."
        if not subscription.lucky_id_id:
            errors["lucky_id"] = "Lucky ID is required for Advance EMI activation."

    if subscription.plan_type in (PlanType.RENT, PlanType.LEASE):
        profile_attr = "rent_profile" if subscription.plan_type == PlanType.RENT else "lease_profile"
        try:
            profile = getattr(subscription, profile_attr)
            if not profile.security_deposit_amount or profile.security_deposit_amount <= 0:
                errors["security_deposit"] = "Security deposit must be recorded before activation."
        except Exception:
            errors["profile"] = f"{subscription.plan_type} profile is missing."

    if errors:
        raise ValidationError(errors)


def _lock_financial_terms(subscription: Subscription, performed_by) -> None:
    if subscription.terms_locked_at:
        return

    now = timezone.now()
    actor_pk = getattr(performed_by, "pk", None)
    Subscription.objects.filter(pk=subscription.pk).update(
        terms_locked_at=now,
        terms_locked_by_id=actor_pk,
    )
    subscription.terms_locked_at = now

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_TERMS_LOCKED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "total_amount": str(subscription.total_amount),
            "monthly_amount": str(subscription.monthly_amount),
            "tenure_months": subscription.tenure_months,
        },
    )


@transaction.atomic
def cancel_contract(
    *,
    subscription: Subscription,
    performed_by,
    reason: str,
    force_after_activation: bool = False,
) -> Subscription:
    """Cancel a contract. Historical payment/ledger records are never deleted."""
    _require_actor(performed_by)

    pre_activation = {
        SubscriptionStatus.DRAFT,
        SubscriptionStatus.REQUESTED,
        SubscriptionStatus.PENDING_APPROVAL,
        SubscriptionStatus.APPROVED,
    }

    if subscription.status not in pre_activation and not force_after_activation:
        raise ValidationError(
            "Cancellation after activation requires force_after_activation=True and an admin reason. "
            "Paid amounts are preserved; no financial records will be deleted."
        )

    if not reason or not reason.strip():
        raise ValidationError({"reason": "Cancellation reason is required."})

    now = timezone.now()
    Subscription.objects.filter(pk=subscription.pk).update(
        status=SubscriptionStatus.CANCELLED,
        cancellation_reason=reason.strip(),
        cancelled_at=now,
        cancelled_by_id=getattr(performed_by, "pk", None),
    )
    subscription.status = SubscriptionStatus.CANCELLED
    subscription.cancellation_reason = reason.strip()
    subscription.cancelled_at = now

    # Release lucky_id if pre-activation EMI
    if (
        subscription.plan_type == PlanType.EMI
        and subscription.lucky_id_id
        and subscription.status not in (SubscriptionStatus.ACTIVE,)
    ):
        from subscriptions.models import LuckyId, LuckyIdStatus
        LuckyId.objects.filter(pk=subscription.lucky_id_id).update(status=LuckyIdStatus.AVAILABLE)

    # Best-effort stock release
    try:
        from inventory.services.stock_movement_service import release_stock_reservation
        release_stock_reservation(
            inventory_item=subscription.product.inventory_item,
            quantity=1,
            reference_model="Subscription",
            reference_id=str(subscription.pk),
            posted_by=performed_by,
            notes=f"Released on contract cancellation",
        )
    except Exception:
        pass

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CANCELLED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"reason": reason[:300]},
    )
    return subscription


@transaction.atomic
def close_contract(*, subscription: Subscription, performed_by) -> Subscription:
    """Move contract to CLOSED (terminal state)."""
    _require_actor(performed_by)

    closable = {SubscriptionStatus.COMPLETED, SubscriptionStatus.RETURNED}
    if subscription.status not in closable:
        raise ValidationError(
            f"Cannot close a contract in status '{subscription.status}'. Expected COMPLETED or RETURNED."
        )

    change_subscription_status(subscription, SubscriptionStatus.CLOSED)

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CLOSED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"contract_number": subscription.subscription_number},
    )
    return subscription
