"""Live rent/lease billing, deposit demand, and deposit workflow services."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    ContractRefundStatus,
    LeaseSubscriptionProfile,
    MONEY_ZERO,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionStatus,
    q2,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.rent_lease_finance_sync_service import (
    sync_damage_deduction_income,
    sync_deposit_refund_liability_reduction,
    sync_security_deposit_liability,
)


@dataclass(frozen=True)
class DepositSnapshot:
    deposit_amount: Decimal
    collected_amount: Decimal
    held_amount: Decimal
    refundable_amount: Decimal
    deducted_amount: Decimal
    refunded_amount: Decimal
    refund_status: str


def _add_months(anchor: date, months: int) -> date:
    year = anchor.year + (anchor.month - 1 + months) // 12
    month = (anchor.month - 1 + months) % 12 + 1
    day = min(anchor.day, 28)
    return date(year, month, day)


def _active_rent_lease_subscriptions():
    return Subscription.objects.select_related("customer", "product").filter(
        plan_type__in=[PlanType.RENT, PlanType.LEASE],
        status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.APPROVED, SubscriptionStatus.PENDING_APPROVAL],
    )


def _monthly_reference_key(subscription: Subscription, period_start: date) -> str:
    bucket = period_start.strftime("%Y%m")
    return f"RL-{subscription.id}-{subscription.plan_type}-M-{bucket}"


def _deposit_reference_key(subscription: Subscription) -> str:
    return f"RL-{subscription.id}-{subscription.plan_type}-DEPOSIT"


def _monthly_demand_type(subscription: Subscription) -> str:
    return (
        RentLeaseDemandType.RENT_MONTHLY
        if subscription.plan_type == PlanType.RENT
        else RentLeaseDemandType.LEASE_MONTHLY
    )


@transaction.atomic
def ensure_security_deposit_demand(*, subscription: Subscription, performed_by=None) -> RentLeaseBillingDemand:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Security deposit demands are only supported for RENT/LEASE contracts.")

    profile = (
        subscription.rent_profile
        if subscription.plan_type == PlanType.RENT
        else subscription.lease_profile
    )
    deposit_amount = q2(Decimal(str(profile.security_deposit_amount or MONEY_ZERO)))
    demand, created = RentLeaseBillingDemand.objects.get_or_create(
        reference_key=_deposit_reference_key(subscription),
        defaults={
            "subscription": subscription,
            "demand_type": RentLeaseDemandType.SECURITY_DEPOSIT,
            "status": RentLeaseDemandStatus.PENDING,
            "due_date": subscription.start_date or timezone.localdate(),
            "amount": deposit_amount,
            "collected_amount": MONEY_ZERO,
            "held_amount": MONEY_ZERO,
            "refundable_amount": deposit_amount,
            "deducted_amount": MONEY_ZERO,
            "metadata": {
                "contract_number": subscription.subscription_number,
                "customer_id": subscription.customer_id,
                "product_id": subscription.product_id,
                "security_deposit_percent": str(profile.security_deposit_percent),
            },
        },
    )
    if created:
        RentLeaseDepositTransaction.objects.create(
            subscription=subscription,
            demand=demand,
            transaction_type=RentLeaseDepositTransactionType.DEMAND_CREATED,
            amount=deposit_amount,
            performed_by=performed_by,
            metadata={"reference_key": demand.reference_key},
        )
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=subscription,
            performed_by=performed_by,
            metadata={
                "event": "RENT_LEASE_DEPOSIT_DEMAND_CREATED",
                "reference_key": demand.reference_key,
                "amount": str(deposit_amount),
            },
        )
    return demand


@transaction.atomic
def generate_monthly_demands_for_subscription(
    *, subscription: Subscription, through_date: date | None = None, performed_by=None
) -> dict:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Monthly rent/lease demands are only supported for RENT/LEASE contracts.")

    ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    through = through_date or timezone.localdate()
    start_date = subscription.start_date or through
    tenure = max(int(subscription.tenure_months or 0), 0)
    amount = q2(Decimal(str(subscription.monthly_amount or MONEY_ZERO)))
    created_count = 0

    for month_idx in range(tenure):
        period_start = _add_months(start_date, month_idx)
        if period_start > through:
            break
        period_end = _add_months(period_start, 1)
        due_date = period_start
        reference_key = _monthly_reference_key(subscription, period_start)

        demand, created = RentLeaseBillingDemand.objects.get_or_create(
            reference_key=reference_key,
            defaults={
                "subscription": subscription,
                "demand_type": _monthly_demand_type(subscription),
                "status": RentLeaseDemandStatus.PENDING,
                "billing_period_start": period_start,
                "billing_period_end": period_end,
                "due_date": due_date,
                "amount": amount,
                "metadata": {
                    "billing_month_number": month_idx + 1,
                    "contract_number": subscription.subscription_number,
                    "customer_id": subscription.customer_id,
                    "product_id": subscription.product_id,
                },
            },
        )
        if created:
            created_count += 1
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=subscription,
                performed_by=performed_by,
                metadata={
                    "event": "RENT_LEASE_MONTHLY_DEMAND_CREATED",
                    "reference_key": demand.reference_key,
                    "billing_period_start": period_start.isoformat(),
                    "amount": str(amount),
                },
            )
    recalculate_rent_lease_demand_statuses(subscription=subscription)
    return {"subscription_id": subscription.id, "created_count": created_count}


@transaction.atomic
def generate_rent_lease_demands(*, through_date: date | None = None, performed_by=None) -> dict:
    created = 0
    for subscription in _active_rent_lease_subscriptions():
        result = generate_monthly_demands_for_subscription(
            subscription=subscription,
            through_date=through_date,
            performed_by=performed_by,
        )
        created += int(result["created_count"])
    return {"created_count": created}


@transaction.atomic
def recalculate_rent_lease_demand_statuses(*, subscription: Subscription) -> None:
    today = timezone.localdate()
    monthly_qs = RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
    )
    for demand in monthly_qs:
        if demand.collected_amount >= demand.amount:
            demand.status = RentLeaseDemandStatus.PAID
        elif demand.collected_amount > MONEY_ZERO:
            demand.status = RentLeaseDemandStatus.PARTIAL
        elif demand.due_date < today:
            demand.status = RentLeaseDemandStatus.OVERDUE
        else:
            demand.status = RentLeaseDemandStatus.PENDING
        demand.save(update_fields=["status", "updated_at"])


@transaction.atomic
def collect_security_deposit(
    *, subscription: Subscription, amount: Decimal, performed_by=None, reference_no: str = ""
) -> RentLeaseBillingDemand:
    demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    amount_q = q2(Decimal(str(amount or MONEY_ZERO)))
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Collected deposit amount must be greater than zero."})
    outstanding = q2(demand.amount - demand.collected_amount)
    if amount_q > outstanding:
        raise ValidationError({"amount": "Collected amount exceeds deposit outstanding balance."})

    demand.collected_amount = q2(demand.collected_amount + amount_q)
    demand.held_amount = demand.collected_amount
    demand.refundable_amount = q2(max(demand.collected_amount - demand.deducted_amount, MONEY_ZERO))
    demand.status = (
        RentLeaseDemandStatus.PAID
        if demand.collected_amount >= demand.amount
        else RentLeaseDemandStatus.PARTIAL
    )
    demand.save(update_fields=["collected_amount", "held_amount", "refundable_amount", "status", "updated_at"])

    RentLeaseDepositTransaction.objects.create(
        subscription=subscription,
        demand=demand,
        transaction_type=RentLeaseDepositTransactionType.COLLECTED,
        amount=amount_q,
        performed_by=performed_by,
        metadata={"reference_no": (reference_no or "").strip()},
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_LEASE_DEPOSIT_COLLECTED",
            "reference_key": demand.reference_key,
            "amount": str(amount_q),
        },
    )
    sync_security_deposit_liability(
        subscription=subscription,
        amount=amount_q,
        performed_by=performed_by,
    )
    return demand


def _require_rent_lease_profile(subscription: Subscription):
    if subscription.plan_type == PlanType.RENT:
        return subscription.rent_profile
    if subscription.plan_type == PlanType.LEASE:
        return subscription.lease_profile
    raise ValidationError("Deposit workflow is available only for RENT/LEASE subscriptions.")


@transaction.atomic
def record_damage_deduction(
    *,
    subscription: Subscription,
    amount: Decimal,
    reason: str,
    performed_by=None,
    inspection=None,
) -> RentLeaseBillingDemand:
    if not (reason or "").strip():
        raise ValidationError({"reason": "Deduction reason is required."})
    amount_q = q2(Decimal(str(amount or MONEY_ZERO)))
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Deduction amount must be greater than zero."})

    demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    refundable_before = q2(max(demand.collected_amount - demand.deducted_amount, MONEY_ZERO))
    if amount_q > refundable_before:
        raise ValidationError({"amount": "Deduction cannot exceed refundable deposit amount."})

    profile = _require_rent_lease_profile(subscription)
    demand.deducted_amount = q2(demand.deducted_amount + amount_q)
    demand.refundable_amount = q2(max(demand.collected_amount - demand.deducted_amount, MONEY_ZERO))
    demand.held_amount = demand.refundable_amount
    demand.save(update_fields=["deducted_amount", "refundable_amount", "held_amount", "updated_at"])

    profile.deduction_amount = q2(Decimal(str(profile.deduction_amount or MONEY_ZERO)) + amount_q)
    profile.refundable_security_deposit = demand.refundable_amount
    profile.refund_status = ContractRefundStatus.PARTIAL
    profile.return_inspection_notes = reason.strip()
    profile.save(update_fields=["deduction_amount", "refundable_security_deposit", "refund_status", "return_inspection_notes", "updated_at"])

    RentLeaseDepositTransaction.objects.create(
        subscription=subscription,
        demand=demand,
        inspection=inspection,
        transaction_type=RentLeaseDepositTransactionType.DEDUCTION,
        amount=amount_q,
        reason=reason,
        performed_by=performed_by,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_LEASE_DEPOSIT_DEDUCTION_RECORDED",
            "amount": str(amount_q),
            "reason": reason.strip(),
        },
    )
    sync_damage_deduction_income(
        subscription=subscription,
        amount=amount_q,
        performed_by=performed_by,
    )
    return demand


@transaction.atomic
def approve_deposit_refund(
    *, subscription: Subscription, amount: Decimal, approved_by=None, inspection=None
) -> RentLeaseDepositTransaction:
    demand = ensure_security_deposit_demand(subscription=subscription, performed_by=approved_by)
    amount_q = q2(Decimal(str(amount or MONEY_ZERO)))
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Refund amount must be greater than zero."})
    if amount_q > demand.refundable_amount:
        raise ValidationError({"amount": "Refund cannot exceed refundable deposit."})
    tx = RentLeaseDepositTransaction.objects.create(
        subscription=subscription,
        demand=demand,
        inspection=inspection,
        transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED,
        amount=amount_q,
        approved_by=approved_by,
        performed_by=approved_by,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=approved_by,
        metadata={"event": "RENT_LEASE_DEPOSIT_REFUND_APPROVED", "amount": str(amount_q)},
    )
    return tx


@transaction.atomic
def record_deposit_refund(
    *, subscription: Subscription, amount: Decimal, performed_by=None, approval_transaction_id: int | None = None
) -> RentLeaseBillingDemand:
    demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    profile = _require_rent_lease_profile(subscription)
    amount_q = q2(Decimal(str(amount or MONEY_ZERO)))
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Refund amount must be greater than zero."})
    if amount_q > demand.refundable_amount:
        raise ValidationError({"amount": "Refund cannot exceed refundable deposit."})

    demand.refundable_amount = q2(demand.refundable_amount - amount_q)
    demand.held_amount = q2(max(demand.held_amount - amount_q, MONEY_ZERO))
    demand.save(update_fields=["refundable_amount", "held_amount", "updated_at"])

    profile.refund_amount = q2(Decimal(str(profile.refund_amount or MONEY_ZERO)) + amount_q)
    profile.refundable_security_deposit = demand.refundable_amount
    profile.refund_status = (
        ContractRefundStatus.REFUNDED
        if demand.refundable_amount <= MONEY_ZERO
        else ContractRefundStatus.PARTIAL
    )
    profile.save(update_fields=["refund_amount", "refundable_security_deposit", "refund_status", "updated_at"])

    RentLeaseDepositTransaction.objects.create(
        subscription=subscription,
        demand=demand,
        transaction_type=RentLeaseDepositTransactionType.REFUNDED,
        amount=amount_q,
        performed_by=performed_by,
        metadata={"approval_transaction_id": approval_transaction_id},
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "RENT_LEASE_DEPOSIT_REFUNDED", "amount": str(amount_q)},
    )
    sync_deposit_refund_liability_reduction(
        subscription=subscription,
        amount=amount_q,
        performed_by=performed_by,
    )
    return demand


def build_deposit_snapshot(*, subscription: Subscription) -> DepositSnapshot:
    demand = RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
    ).first()
    refunded = (
        RentLeaseDepositTransaction.objects.filter(
            subscription=subscription,
            transaction_type=RentLeaseDepositTransactionType.REFUNDED,
        )
        .aggregate(total=Sum("amount"))
        .get("total")
    )
    profile = _require_rent_lease_profile(subscription)
    deposit_amount = q2(Decimal(str(profile.security_deposit_amount or MONEY_ZERO)))
    if demand is None:
        return DepositSnapshot(
            deposit_amount=deposit_amount,
            collected_amount=MONEY_ZERO,
            held_amount=MONEY_ZERO,
            refundable_amount=deposit_amount,
            deducted_amount=MONEY_ZERO,
            refunded_amount=q2(refunded or MONEY_ZERO),
            refund_status=profile.refund_status,
        )
    return DepositSnapshot(
        deposit_amount=q2(demand.amount),
        collected_amount=q2(demand.collected_amount),
        held_amount=q2(demand.held_amount),
        refundable_amount=q2(demand.refundable_amount),
        deducted_amount=q2(demand.deducted_amount),
        refunded_amount=q2(refunded or MONEY_ZERO),
        refund_status=profile.refund_status,
    )

