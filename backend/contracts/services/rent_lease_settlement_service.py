"""Settle a rent/lease contract in one step: deposit refund + close or cancel.

The contract page used to need three trips (deposits page for the refund,
lifecycle endpoint for close/cancel, and nothing at all for the unused rent
months). This service does it together, atomically, so a closed or cancelled
contract is left with nothing to collect:

* months nobody will use (after the return, or all of them when the goods
  never went out) are cancelled;
* rent already earned but unpaid must be collected first, or explicitly
  waived by the operator;
* the refundable deposit (after an optional damage deduction) is paid out;
* the contract moves to CLOSED (goods back) or CANCELLED.

Stock never moves here: goods still with the customer block the settlement,
because stock only comes back through the delivery return.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from contracts.services.rent_lease_billing_service import (
    MONEY_ZERO,
    build_deposit_settlement,
    q2,
    record_damage_deduction,
    record_deposit_refund,
)
from subscriptions.models import (
    AuditLog,
    DeliveryStatus,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionStatus,
    RentLeaseDepositTransactionType,
    Subscription,
    SubscriptionDelivery,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit

ACTION_CLOSE = "CLOSE"
ACTION_CANCEL = "CANCEL"

# Goods are with the customer (or on the way) — stock has not come back.
GOODS_OUT_DELIVERY_STATUSES = {
    DeliveryStatus.DISPATCHED,
    DeliveryStatus.OUT_FOR_DELIVERY,
    DeliveryStatus.DELIVERED,
    DeliveryStatus.RETURN_REQUESTED,
}
# Goods went out at some point.
GOODS_WENT_OUT_STATUSES = GOODS_OUT_DELIVERY_STATUSES | {DeliveryStatus.RETURNED}

CLOSABLE_STATUSES = {SubscriptionStatus.RETURNED, SubscriptionStatus.COMPLETED}
# The contract itself says the goods are out, whatever the delivery rows say.
GOODS_OUT_CONTRACT_STATUSES = {SubscriptionStatus.HANDED_OVER, SubscriptionStatus.RETURN_PENDING}
TERMINAL_STATUSES = {SubscriptionStatus.CLOSED, SubscriptionStatus.CANCELLED}
CANCEL_BLOCKED_STATUSES = TERMINAL_STATUSES | {SubscriptionStatus.WON, SubscriptionStatus.COMPLETED}

OPEN_DEMAND_STATUSES = [
    RentLeaseDemandStatus.PENDING,
    RentLeaseDemandStatus.OVERDUE,
    RentLeaseDemandStatus.DRY_RUN,
    RentLeaseDemandStatus.PARTIAL,
]
MONTHLY_TYPES = [RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY]


def _money(value) -> str:
    return f"{q2(value or MONEY_ZERO):.2f}"


def _goods_state(subscription: Subscription) -> tuple[bool, bool, str | None, object]:
    """(goods_with_customer, goods_went_out, blocking_delivery_ref, returned_on)."""
    deliveries = list(
        SubscriptionDelivery.objects.filter(subscription=subscription).order_by("-id")
    )
    out = next((d for d in deliveries if d.status in GOODS_OUT_DELIVERY_STATUSES), None)
    went_out = any(d.status in GOODS_WENT_OUT_STATUSES for d in deliveries)
    returned_at = max((d.returned_at for d in deliveries if d.returned_at), default=None)
    returned_on = timezone.localdate(returned_at) if returned_at else None
    ref = None
    if out is not None:
        ref = f"delivery {getattr(out, 'delivery_reference', '') or f'DEL-{out.id}'} ({out.status})"
    elif subscription.status in GOODS_OUT_CONTRACT_STATUSES:
        ref = f"contract is {subscription.status}"
    with_customer = ref is not None
    return with_customer, went_out or with_customer, ref, returned_on


def _split_open_demands(subscription: Subscription, *, went_out: bool, returned_on):
    """Open monthly demands split into (not owed → cancel, earned & unpaid)."""
    open_demands = list(
        RentLeaseBillingDemand.objects.select_for_update()
        .filter(subscription=subscription, demand_type__in=MONTHLY_TYPES, status__in=OPEN_DEMAND_STATUSES)
        .order_by("billing_period_start", "id")
    )
    cutoff = returned_on or timezone.localdate()
    to_cancel, earned = [], []
    for demand in open_demands:
        untouched = q2(demand.collected_amount or MONEY_ZERO) <= MONEY_ZERO
        not_used = (not went_out) or (
            demand.billing_period_start is not None and demand.billing_period_start > cutoff
        )
        (to_cancel if untouched and not_used else earned).append(demand)
    return to_cancel, earned


def _balance(demand) -> Decimal:
    return q2(max(q2(demand.amount or MONEY_ZERO) - q2(demand.collected_amount or MONEY_ZERO), MONEY_ZERO))


def _open_refund_approval_id(subscription: Subscription) -> int | None:
    return (
        RentLeaseDepositTransaction.objects.filter(
            subscription=subscription,
            transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED,
            status=RentLeaseDepositTransactionStatus.ACTIVE,
        )
        .order_by("-id")
        .values_list("id", flat=True)
        .first()
    )


def _deposit_demand(subscription: Subscription):
    return RentLeaseBillingDemand.objects.filter(
        subscription=subscription, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT
    ).first()


def build_settlement_preview(subscription: Subscription) -> dict:
    """What settling this contract would do. Read-only."""
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        return {"applicable": False, "reason": "Only rent and lease contracts are settled here."}

    with_customer, went_out, blocking_ref, returned_on = _goods_state(subscription)
    with transaction.atomic():
        to_cancel, earned = _split_open_demands(subscription, went_out=went_out, returned_on=returned_on)
    deposit = _deposit_demand(subscription)
    refundable = q2(deposit.refundable_amount if deposit else MONEY_ZERO)
    status = subscription.status

    allowed = []
    blockers = []
    if status in TERMINAL_STATUSES:
        blockers.append(f"Contract is already {status}.")
    elif with_customer:
        blockers.append(
            f"The product is still with the customer — {blocking_ref}. "
            "Record the return (delivery RETURNED / return inspection) first so stock comes back."
        )
    else:
        if status in CLOSABLE_STATUSES:
            allowed.append(ACTION_CLOSE)
        if status not in CANCEL_BLOCKED_STATUSES and not (went_out and status in CLOSABLE_STATUSES):
            allowed.append(ACTION_CANCEL)
        if not allowed:
            blockers.append(f"A contract in status {status} cannot be closed or cancelled here.")

    return {
        "applicable": True,
        "status": status,
        "allowed_actions": allowed,
        "recommended_action": allowed[0] if allowed else None,
        "blockers": blockers,
        "goods_with_customer": with_customer,
        "goods_went_out": went_out,
        "returned_on": returned_on.isoformat() if returned_on else None,
        "months_to_cancel": len(to_cancel),
        "months_to_cancel_amount": _money(sum((_balance(d) for d in to_cancel), MONEY_ZERO)),
        "unpaid_rent_months": [
            {
                "demand_id": d.id,
                "reference_key": d.reference_key,
                "period_start": d.billing_period_start.isoformat() if d.billing_period_start else None,
                "amount": _money(d.amount),
                "collected": _money(d.collected_amount),
                "balance": _money(_balance(d)),
            }
            for d in earned
        ],
        "unpaid_rent_amount": _money(sum((_balance(d) for d in earned), MONEY_ZERO)),
        "deposit_refundable": _money(refundable),
        "deposit_held": _money(deposit.held_amount if deposit else MONEY_ZERO),
        "deposit_settlement": build_deposit_settlement(subscription),
    }


@transaction.atomic
def settle_rent_lease_contract(
    *,
    subscription_id: int,
    action: str,
    performed_by,
    reason: str = "",
    waive_unpaid_rent: bool = False,
    deduction_amount=None,
    deduction_reason: str = "",
    finance_account_id=None,
    payment_method: str = "CASH",
    payment_date=None,
    reference_no: str = "",
) -> dict:
    """Refund the deposit, clear what is not owed, and close or cancel."""
    if not performed_by:
        raise ValidationError("performed_by is required.")
    action = (action or "").strip().upper()
    subscription = Subscription.objects.select_for_update(of=("self",)).get(pk=subscription_id)
    preview = build_settlement_preview(subscription)
    if not preview.get("applicable"):
        raise ValidationError({"detail": preview.get("reason")})
    if preview["blockers"]:
        raise ValidationError({"detail": " ".join(preview["blockers"])})
    if action not in preview["allowed_actions"]:
        raise ValidationError(
            {"action": f"{action or 'No action'} is not allowed now. Allowed: {', '.join(preview['allowed_actions'])}."}
        )
    reason = (reason or "").strip()
    if action == ACTION_CANCEL and not reason:
        raise ValidationError({"reason": "A reason is required to cancel the contract."})

    # 1. Rent: cancel months nobody used; earned-but-unpaid must be paid or waived.
    _, went_out, _, returned_on = _goods_state(subscription)
    to_cancel, earned = _split_open_demands(subscription, went_out=went_out, returned_on=returned_on)
    unpaid = q2(sum((_balance(d) for d in earned), MONEY_ZERO))
    if unpaid > MONEY_ZERO and not waive_unpaid_rent:
        raise ValidationError(
            {
                "waive_unpaid_rent": (
                    f"₹{unpaid:.2f} rent is still unpaid for months already used. "
                    "Collect it first, or tick 'waive unpaid rent' to write it off."
                )
            }
        )
    cancel_tag = "CONTRACT_CANCELLED" if action == ACTION_CANCEL else "CONTRACT_CLOSED"
    for demand in to_cancel:
        demand.status = RentLeaseDemandStatus.CANCELLED
        demand.metadata = {**(demand.metadata or {}), "cancelled_reason": cancel_tag}
        demand.save(update_fields=["status", "metadata", "updated_at"])
    for demand in earned:
        demand.status = RentLeaseDemandStatus.WAIVED
        demand.metadata = {
            **(demand.metadata or {}),
            "waived_reason": "SETTLEMENT_WAIVER",
            "waived_amount": _money(_balance(demand)),
            "waived_by_id": getattr(performed_by, "pk", None),
        }
        demand.save(update_fields=["status", "metadata", "updated_at"])

    # 2. Deposit: optional deduction, then pay out whatever is refundable.
    deduction = q2(Decimal(str(deduction_amount or "0") or "0"))
    if deduction > MONEY_ZERO:
        record_damage_deduction(
            subscription=subscription,
            amount=deduction,
            reason=(deduction_reason or "").strip(),
            performed_by=performed_by,
        )
    deposit = _deposit_demand(subscription)
    refund = q2(deposit.refundable_amount if deposit else MONEY_ZERO)
    refund_tx = None
    if refund > MONEY_ZERO:
        if not finance_account_id:
            raise ValidationError(
                {"finance_account_id": f"Pick the Cash/Bank account the ₹{refund:.2f} deposit refund is paid from."}
            )
        demand = record_deposit_refund(
            subscription=subscription,
            amount=refund,
            performed_by=performed_by,
            approval_transaction_id=_open_refund_approval_id(subscription),
            reference_no=reference_no,
            finance_account_id=finance_account_id,
            payment_method=payment_method or "CASH",
            payment_date=payment_date,
            idempotency_key=f"SETTLE-{subscription.pk}-{action}",
        )
        refund_tx = getattr(demand, "_deposit_source_transaction", None)

    # 3. Contract status.
    previous_status = subscription.status
    if action == ACTION_CLOSE:
        from contracts.services.contract_lifecycle_service import close_contract

        close_contract(subscription=subscription, performed_by=performed_by)
    else:
        from contracts.services.operational_cancellation_service import cancel_subscription

        cancel_subscription(
            subscription_id=subscription.pk,
            actor=performed_by,
            reason=reason,
            internal_note="Settled from the contract page (deposit refund + cancel).",
            force_after_activation=True,
        )
    subscription.refresh_from_db()

    result = {
        "action": action,
        "previous_status": previous_status,
        "status": subscription.status,
        "cancelled_demand_ids": [d.id for d in to_cancel],
        "waived_demand_ids": [d.id for d in earned],
        "waived_rent_amount": _money(unpaid),
        "deposit_deducted": _money(deduction),
        "deposit_refunded": _money(refund),
        "refund_reference": getattr(refund_tx, "transaction_number", "") or "",
    }
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "RENT_LEASE_CONTRACT_SETTLED", "reason": reason[:300], **result},
    )
    return result
