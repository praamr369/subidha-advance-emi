"""Live rent/lease billing, deposit demand, and deposit workflow services."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.services.non_gst_document_service import build_non_gst_snapshot
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


def _demand_tax_snapshot(*, subscription: Subscription, document_date: date, document_type: str) -> dict:
    return build_non_gst_snapshot(
        document_type=document_type,
        document_date=document_date,
        party_type="CUSTOMER",
        party_id=subscription.customer_id,
        product_id=subscription.product_id,
    )


def _normal_reference(value: str | None) -> str:
    return (value or "").strip().upper()


def _normal_method(value: str | None) -> str:
    return (value or "CASH").strip().upper()


def _payment_date(value):
    return value or timezone.localdate()


def _find_existing_deposit_source(
    *,
    subscription: Subscription,
    transaction_type: str,
    amount_q: Decimal,
    payment_method: str,
    finance_account_id,
    transaction_date,
    reference_no: str = "",
    idempotency_key: str = "",
    demand_id=None,
) -> RentLeaseDepositTransaction | None:
    normalized_reference = _normal_reference(reference_no)
    normalized_idempotency = (idempotency_key or "").strip()
    if not normalized_reference and not normalized_idempotency:
        return None

    qs = RentLeaseDepositTransaction.objects.select_related("demand", "subscription").filter(
        status="ACTIVE",
        transaction_type=transaction_type,
    )
    existing = None
    if normalized_idempotency:
        existing = qs.filter(idempotency_key=normalized_idempotency).first()
    if existing is None and normalized_reference:
        existing = qs.filter(external_reference_no=normalized_reference).first()
    if existing is None:
        return None

    errors = {}
    if existing.subscription_id != subscription.id:
        errors["subscription"] = "Existing deposit source evidence belongs to another subscription."
    if existing.plan_type != subscription.plan_type:
        errors["plan_type"] = "Existing deposit source evidence has a different plan type."
    if q2(existing.amount) != amount_q:
        errors["amount"] = "Existing deposit source evidence has a different amount."
    if existing.payment_method != payment_method:
        errors["payment_method"] = "Existing deposit source evidence has a different payment method."
    if finance_account_id and existing.finance_account_id != int(finance_account_id):
        errors["finance_account"] = "Existing deposit source evidence has a different finance account."
    if transaction_date and existing.transaction_date != transaction_date:
        errors["transaction_date"] = "Existing deposit source evidence has a different transaction date."
    if demand_id is not None and existing.demand_id != int(demand_id):
        errors["demand"] = "Existing deposit source evidence belongs to another demand."
    if errors:
        raise ValidationError(errors)
    return existing


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
            "tax_profile_snapshot": _demand_tax_snapshot(
                subscription=subscription,
                document_date=subscription.start_date or timezone.localdate(),
                document_type="NON_GST_DEPOSIT_RECEIPT",
            ),
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
                "tax_profile_snapshot": _demand_tax_snapshot(
                    subscription=subscription,
                    document_date=due_date,
                    document_type="NON_GST_RENT_RECEIPT"
                    if subscription.plan_type == PlanType.RENT
                    else "NON_GST_LEASE_RECEIPT",
                ),
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
        if not demand.tax_profile_snapshot:
            demand.tax_profile_snapshot = _demand_tax_snapshot(
                subscription=subscription,
                document_date=demand.due_date,
                document_type="NON_GST_RENT_RECEIPT"
                if demand.demand_type == RentLeaseDemandType.RENT_MONTHLY
                else "NON_GST_LEASE_RECEIPT",
            )
            demand.save(update_fields=["status", "tax_profile_snapshot", "updated_at"])
        else:
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
    if not demand.tax_profile_snapshot:
        demand.tax_profile_snapshot = _demand_tax_snapshot(
            subscription=subscription,
            document_date=demand.due_date,
            document_type="NON_GST_DEPOSIT_RECEIPT",
        )
    demand.save(update_fields=["collected_amount", "held_amount", "refundable_amount", "status", "tax_profile_snapshot", "updated_at"])

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

    deduction_tx = RentLeaseDepositTransaction.objects.create(
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
    # Post the damage deduction to the canonical accounting bridge
    # (Dr Security Deposit Liability / Cr Damage Recovery Income). This replaces
    # the legacy direct-journal sync (source_model="Subscription") with the
    # idempotent AccountingBridgePosting path (source = the DEDUCTION transaction).
    # No-op (DEFERRED) unless the rent/lease posting bridge is explicitly enabled.
    from subscriptions.services.rent_lease_accounting_bridge_service import (
        post_security_deposit_damage_deduction,
    )

    post_security_deposit_damage_deduction(deduction_tx, performed_by=performed_by)
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
    *,
    subscription: Subscription,
    amount: Decimal,
    performed_by=None,
    approval_transaction_id: int | None = None,
    reference_no: str = "",
    finance_account_id=None,
    payment_method: str = "",
    payment_date=None,
    idempotency_key: str = "",
) -> RentLeaseBillingDemand:
    demand = ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    profile = _require_rent_lease_profile(subscription)
    amount_q = q2(Decimal(str(amount or MONEY_ZERO)))
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Refund amount must be greater than zero."})
    resolved_payment_method = _normal_method(payment_method)
    resolved_payment_date = _payment_date(payment_date)
    source_enabled = bool(finance_account_id)
    if source_enabled:
        existing = _find_existing_deposit_source(
            subscription=subscription,
            transaction_type=RentLeaseDepositTransactionType.DEPOSIT_REFUND,
            amount_q=amount_q,
            payment_method=resolved_payment_method,
            finance_account_id=finance_account_id,
            transaction_date=resolved_payment_date,
            reference_no=reference_no,
            idempotency_key=idempotency_key,
            demand_id=demand.id,
        )
        if existing is not None:
            setattr(demand, "_deposit_source_transaction", existing)
            setattr(demand, "_deposit_source_transaction_created", False)
            return demand
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

    tx_defaults = {
        "subscription": subscription,
        "demand": demand,
        "amount": amount_q,
        "performed_by": performed_by,
        "metadata": {"approval_transaction_id": approval_transaction_id},
    }
    if source_enabled:
        tx_defaults.update(
            {
                "customer": subscription.customer,
                "plan_type": subscription.plan_type,
                "transaction_type": RentLeaseDepositTransactionType.DEPOSIT_REFUND,
                "transaction_date": resolved_payment_date,
                "payment_method": resolved_payment_method,
                "finance_account_id": finance_account_id,
                "external_reference_no": _normal_reference(reference_no),
                "idempotency_key": (idempotency_key or "").strip(),
                "created_by": performed_by,
                "metadata": {
                    "approval_transaction_id": approval_transaction_id,
                    "reference_no": (reference_no or "").strip(),
                    "finance_account_id": finance_account_id,
                    "payment_method": resolved_payment_method,
                    "payment_date": resolved_payment_date.isoformat() if hasattr(resolved_payment_date, "isoformat") else None,
                    "amount": str(amount_q),
                    "demand_id": demand.id,
                    "demand_type": demand.demand_type,
                    "reference_key": demand.reference_key,
                },
            }
        )
    else:
        tx_defaults["transaction_type"] = RentLeaseDepositTransactionType.REFUNDED
    try:
        tx = RentLeaseDepositTransaction.objects.create(**tx_defaults)
        created = True
    except IntegrityError:
        if not source_enabled:
            raise
        tx = _find_existing_deposit_source(
            subscription=subscription,
            transaction_type=RentLeaseDepositTransactionType.DEPOSIT_REFUND,
            amount_q=amount_q,
            payment_method=resolved_payment_method,
            finance_account_id=finance_account_id,
            transaction_date=resolved_payment_date,
            reference_no=reference_no,
            idempotency_key=idempotency_key,
            demand_id=demand.id,
        )
        if tx is None:
            raise
        created = False
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_LEASE_DEPOSIT_REFUNDED",
            "amount": str(amount_q),
            "deposit_source_transaction_id": tx.id,
            "deposit_source_reference": tx.transaction_number,
        },
    )
    setattr(demand, "_deposit_source_transaction", tx)
    setattr(demand, "_deposit_source_transaction_created", created)
    return demand


def build_deposit_snapshot(*, subscription: Subscription) -> DepositSnapshot:
    demand = RentLeaseBillingDemand.objects.filter(
        subscription=subscription,
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
    ).first()
    refunded = (
        RentLeaseDepositTransaction.objects.filter(
            subscription=subscription,
            transaction_type__in=[
                RentLeaseDepositTransactionType.REFUNDED,
                RentLeaseDepositTransactionType.DEPOSIT_REFUND,
            ],
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


def list_admin_deposit_register(*, subscription_id: int | None = None, limit: int = 200) -> dict:
    qs = RentLeaseBillingDemand.objects.filter(
        demand_type=RentLeaseDemandType.SECURITY_DEPOSIT
    ).select_related("subscription", "subscription__customer", "subscription__product")
    if subscription_id:
        qs = qs.filter(subscription_id=subscription_id)
    rows = list(qs.order_by("-created_at", "-id")[:limit])
    latest_sources = {}
    for tx in (
        RentLeaseDepositTransaction.objects.filter(
            demand_id__in=[row.id for row in rows],
            transaction_type__in=[
                RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
                RentLeaseDepositTransactionType.DEPOSIT_REFUND,
                RentLeaseDepositTransactionType.DEPOSIT_ADJUSTMENT,
            ],
        )
        .select_related("finance_account")
        .order_by("demand_id", "-transaction_date", "-created_at", "-id")
    ):
        latest_sources.setdefault(tx.demand_id, tx)
    return {
        "count": qs.count(),
        "results": [
            {
                "demand_id": row.id,
                "reference_key": row.reference_key,
                "subscription_id": row.subscription_id,
                "subscription_number": getattr(row.subscription, "subscription_number", None),
                "plan_type": row.subscription.plan_type,
                "customer_name": row.subscription.customer.name,
                "product_name": getattr(row.subscription.product, "name", ""),
                "deposit_amount": f"{q2(row.amount):.2f}",
                "collected_amount": f"{q2(row.collected_amount):.2f}",
                "held_amount": f"{q2(row.held_amount):.2f}",
                "refundable_amount": f"{q2(row.refundable_amount):.2f}",
                "deducted_amount": f"{q2(row.deducted_amount):.2f}",
                "status": row.status,
                "due_date": row.due_date,
                "latest_transaction": (
                    {
                        "transaction_id": latest_sources[row.id].id,
                        "transaction_number": latest_sources[row.id].transaction_number,
                        "source_reference": latest_sources[row.id].transaction_number,
                        "transaction_type": latest_sources[row.id].transaction_type,
                        "amount": f"{q2(latest_sources[row.id].amount):.2f}",
                        "reference_no": latest_sources[row.id].external_reference_no,
                        "payment_method": latest_sources[row.id].payment_method,
                        "payment_date": latest_sources[row.id].transaction_date,
                        "finance_account_id": latest_sources[row.id].finance_account_id,
                        "finance_account_name": getattr(latest_sources[row.id].finance_account, "name", None),
                        "status": latest_sources[row.id].status,
                        "created_at": latest_sources[row.id].created_at,
                    }
                    if row.id in latest_sources
                    else None
                ),
            }
            for row in rows
        ],
    }
