"""Production-safe rent/lease source collection helpers.

This module records collections against the authoritative rent/lease demand
source tables only. It intentionally does not create Payment, ReceiptDocument,
JournalEntry, MoneyMovement, SettlementAllocation, or ReconciliationItem rows.
Accounting posting remains audit-deferred through rent_lease_finance_sync_service.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    ContractReferenceType,
    MONEY_ZERO,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    Subscription,
    q2,
)
from subscriptions.services import contract_reference_service as base_contract_reference_service
from subscriptions.services.audit_service import log_audit
from subscriptions.services.rent_lease_billing_service import (
    _demand_tax_snapshot,
    ensure_security_deposit_demand,
)
from subscriptions.services.rent_lease_finance_sync_service import (
    sync_rent_lease_monthly_income,
    sync_security_deposit_liability,
)

COLLECT_RENT_LEASE = "COLLECT_RENT_LEASE"
SOURCE_COLLECTION_AUDIT_NOTE = (
    "Operational source collection is enabled. Accounting posting bridge remains "
    "audit-deferred until approved."
)


def _money(value) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _money_string(value) -> str:
    return f"{_money(value):.2f}"


def _json_date(value) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def _collection_metadata(
    *,
    reference_no: str = "",
    finance_account_id=None,
    payment_method: str = "",
    payment_date=None,
    branch_id=None,
    cash_counter_id=None,
    note: str = "",
    demand: RentLeaseBillingDemand | None = None,
    amount=None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "reference_no": (reference_no or "").strip(),
        "finance_account_id": finance_account_id,
        "payment_method": (payment_method or "").strip().upper(),
        "payment_date": _json_date(payment_date),
        "branch_id": branch_id,
        "cash_counter_id": cash_counter_id,
        "note": (note or "").strip(),
    }
    if demand is not None:
        metadata.update(
            {
                "demand_id": demand.id,
                "demand_type": demand.demand_type,
                "reference_key": demand.reference_key,
            }
        )
    if amount is not None:
        metadata["amount"] = str(_money(amount))
    return metadata


def _monthly_document_type(demand: RentLeaseBillingDemand) -> str:
    return (
        "NON_GST_RENT_RECEIPT"
        if demand.demand_type == RentLeaseDemandType.RENT_MONTHLY
        else "NON_GST_LEASE_RECEIPT"
    )


def _monthly_demand_types(subscription: Subscription) -> tuple[str, ...]:
    if subscription.plan_type == PlanType.RENT:
        return (RentLeaseDemandType.RENT_MONTHLY,)
    if subscription.plan_type == PlanType.LEASE:
        return (RentLeaseDemandType.LEASE_MONTHLY,)
    raise ValidationError("Rent/lease collection is available only for RENT/LEASE subscriptions.")


def _outstanding_demands(subscription: Subscription):
    return (
        RentLeaseBillingDemand.objects.filter(subscription=subscription)
        .exclude(status__in=[RentLeaseDemandStatus.CANCELLED, RentLeaseDemandStatus.WAIVED])
        .order_by("due_date", "id")
    )


@transaction.atomic
def collect_security_deposit_with_metadata(
    *,
    subscription: Subscription,
    amount,
    performed_by=None,
    reference_no: str = "",
    finance_account_id=None,
    payment_method: str = "",
    payment_date=None,
    branch_id=None,
    cash_counter_id=None,
    note: str = "",
) -> RentLeaseBillingDemand:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Security deposit collection is available only for RENT/LEASE subscriptions.")

    ensure_security_deposit_demand(subscription=subscription, performed_by=performed_by)
    demand = (
        RentLeaseBillingDemand.objects.select_for_update()
        .filter(subscription=subscription, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
        .first()
    )
    if demand is None:
        raise ValidationError("Security deposit demand was not found.")

    amount_q = _money(amount)
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Collected deposit amount must be greater than zero."})
    outstanding = q2(demand.amount - demand.collected_amount)
    if amount_q > outstanding:
        raise ValidationError({"amount": "Collected amount exceeds deposit outstanding balance."})

    demand.collected_amount = q2(demand.collected_amount + amount_q)
    demand.held_amount = demand.collected_amount
    demand.refundable_amount = q2(max(demand.collected_amount - demand.deducted_amount, MONEY_ZERO))
    demand.status = RentLeaseDemandStatus.PAID if demand.collected_amount >= demand.amount else RentLeaseDemandStatus.PARTIAL
    if not demand.tax_profile_snapshot:
        demand.tax_profile_snapshot = _demand_tax_snapshot(
            subscription=subscription,
            document_date=demand.due_date,
            document_type="NON_GST_DEPOSIT_RECEIPT",
        )
    demand.save(
        update_fields=[
            "collected_amount",
            "held_amount",
            "refundable_amount",
            "status",
            "tax_profile_snapshot",
            "updated_at",
        ]
    )

    metadata = _collection_metadata(
        reference_no=reference_no,
        finance_account_id=finance_account_id,
        payment_method=payment_method,
        payment_date=payment_date,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        note=note,
        demand=demand,
        amount=amount_q,
    )
    RentLeaseDepositTransaction.objects.create(
        subscription=subscription,
        demand=demand,
        transaction_type=RentLeaseDepositTransactionType.COLLECTED,
        amount=amount_q,
        performed_by=performed_by,
        metadata=metadata,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "RENT_LEASE_DEPOSIT_COLLECTED", **metadata},
    )
    sync_security_deposit_liability(subscription=subscription, amount=amount_q, performed_by=performed_by)
    return demand


@transaction.atomic
def collect_rent_lease_monthly_demand(
    *,
    subscription: Subscription,
    amount,
    performed_by=None,
    reference_no: str = "",
    demand_id=None,
    finance_account_id=None,
    payment_method: str = "",
    payment_date=None,
    branch_id=None,
    cash_counter_id=None,
    note: str = "",
) -> RentLeaseBillingDemand:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Rent/lease monthly demand collection is available only for RENT/LEASE subscriptions.")

    amount_q = _money(amount)
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Collected amount must be greater than zero."})

    demand_types = _monthly_demand_types(subscription)
    qs = (
        RentLeaseBillingDemand.objects.select_for_update()
        .filter(subscription=subscription, demand_type__in=demand_types)
        .exclude(status__in=[RentLeaseDemandStatus.CANCELLED, RentLeaseDemandStatus.WAIVED])
        .order_by("due_date", "id")
    )
    if demand_id is not None:
        qs = qs.filter(pk=demand_id)
    demand = next((row for row in qs if row.outstanding_amount() > MONEY_ZERO), None)
    if demand is None:
        raise ValidationError("No collectible rent/lease demand is currently pending.")

    outstanding = demand.outstanding_amount()
    if amount_q > outstanding:
        raise ValidationError({"amount": "Collected amount exceeds demand outstanding balance."})

    demand.collected_amount = q2(demand.collected_amount + amount_q)
    demand.status = RentLeaseDemandStatus.PAID if demand.collected_amount >= demand.amount else RentLeaseDemandStatus.PARTIAL
    if not demand.tax_profile_snapshot:
        demand.tax_profile_snapshot = _demand_tax_snapshot(
            subscription=subscription,
            document_date=demand.due_date,
            document_type=_monthly_document_type(demand),
        )
    demand.save(update_fields=["collected_amount", "status", "tax_profile_snapshot", "updated_at"])

    metadata = _collection_metadata(
        reference_no=reference_no,
        finance_account_id=finance_account_id,
        payment_method=payment_method,
        payment_date=payment_date,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        note=note,
        demand=demand,
        amount=amount_q,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "RENT_LEASE_MONTHLY_DEMAND_COLLECTED", **metadata},
    )
    sync_rent_lease_monthly_income(subscription=subscription, amount=amount_q, performed_by=performed_by)
    return demand


def rent_lease_receivable_position(subscription: Subscription) -> dict[str, object]:
    demands = list(_outstanding_demands(subscription))
    today = timezone.localdate()
    outstanding_rows: list[tuple[RentLeaseBillingDemand, Decimal]] = []
    overdue_amount = MONEY_ZERO
    paid_amount = MONEY_ZERO
    total_amount = MONEY_ZERO

    for demand in demands:
        total_amount += _money(demand.amount)
        paid_amount += _money(demand.collected_amount)
        outstanding = demand.outstanding_amount()
        if outstanding <= MONEY_ZERO:
            continue
        outstanding_rows.append((demand, outstanding))
        if demand.due_date and demand.due_date < today:
            overdue_amount += outstanding

    next_demand, next_amount = outstanding_rows[0] if outstanding_rows else (None, MONEY_ZERO)
    if total_amount <= MONEY_ZERO:
        payment_state = "UNPAID"
    elif paid_amount >= total_amount:
        payment_state = "FULLY_PAID"
    elif paid_amount > MONEY_ZERO:
        payment_state = "PARTIALLY_PAID"
    else:
        payment_state = "UNPAID"

    return {
        "due_amount": _money(next_amount),
        "overdue_amount": _money(overdue_amount),
        "next_due_date": getattr(next_demand, "due_date", None),
        "status": getattr(next_demand, "status", None) or subscription.status,
        "demand_id": getattr(next_demand, "id", None),
        "demand_type": getattr(next_demand, "demand_type", None),
        "collection_type": getattr(next_demand, "demand_type", None) or "RENT_LEASE",
        "paid_amount": _money(paid_amount),
        "total_amount": _money(total_amount),
        "payment_state": payment_state,
        "allowed_actions": [COLLECT_RENT_LEASE] if next_demand else [],
        "disabled_reason": None if next_demand else "No collectible rent/lease demand is currently pending.",
        "is_collectible": bool(next_demand),
        "is_overdue": bool(overdue_amount > MONEY_ZERO),
    }


def rent_lease_collection_route(subscription_id: int | None, *, audience: str = "admin") -> str:
    aud = (audience or "admin").strip().lower()
    prefix = "/cashier/collect" if aud == "cashier" else "/admin/finance/collect"
    suffix = f"&subscription={subscription_id}" if subscription_id else ""
    return f"{prefix}?workflow=unified{suffix}"


def _rent_lease_result(reference, *, audience: str = "admin") -> dict[str, object]:
    position = rent_lease_receivable_position(reference.subscription)
    due = position.get("due_amount")
    collection_route = rent_lease_collection_route(reference.subscription_id, audience=audience)
    result_type = "DEPOSIT" if position.get("demand_type") == RentLeaseDemandType.SECURITY_DEPOSIT else reference.contract_type
    return {
        "contract_reference_id": reference.id,
        "result_type": result_type,
        "action_type": COLLECT_RENT_LEASE if position.get("is_collectible") else "DISABLED",
        "collectible": bool(position.get("is_collectible")),
        "collection_workflow": str(position.get("collection_type") or reference.contract_type),
        "reason_if_not_collectible": position.get("disabled_reason"),
        "source_type": reference.contract_type,
        "source_id": reference.subscription_id,
        "reference_no": reference.reference_no,
        "display_reference": reference.display_reference,
        "customer_id": reference.customer_id,
        "customer_name": reference.customer_name_snapshot,
        "phone_masked": base_contract_reference_service._mask_phone(reference.phone_snapshot),
        "product_summary": reference.product_summary_snapshot,
        "due_amount": _money_string(due),
        "paid_amount": _money_string(position.get("paid_amount")),
        "total_amount": _money_string(position.get("total_amount")),
        "overdue_amount": _money_string(position.get("overdue_amount")),
        "is_overdue": bool(position.get("is_overdue")),
        "next_due_date": position.get("next_due_date"),
        "due_date": position.get("next_due_date"),
        "status": position.get("status") or "",
        "payment_state": position.get("payment_state") or "",
        "primary_action": COLLECT_RENT_LEASE if position.get("is_collectible") else "DISABLED",
        "allowed_actions": position.get("allowed_actions") or [],
        "disabled_reason": position.get("disabled_reason"),
        "collection_route": collection_route,
        "action_url": collection_route,
        "demand_id": position.get("demand_id"),
        "demand_type": position.get("demand_type"),
    }


def build_receivable_result(reference, *, audience: str = "admin") -> dict[str, object]:
    if reference.contract_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE} and reference.subscription_id:
        return _rent_lease_result(reference, audience=audience)
    return base_contract_reference_service.build_receivable_result(reference, audience=audience)


def search_receivables(*, query: str = "", user=None, audience: str = "admin", limit: int = 50) -> list[dict[str, object]]:
    references = base_contract_reference_service.search_contract_references(
        query=query,
        user=user,
        audience=audience,
        limit=limit,
    )
    return [build_receivable_result(reference, audience=audience) for reference in references]


def preview_unified_receivable_allocation(*, source_type: str, source_id: int, amount) -> dict[str, object]:
    source_type = (source_type or "").strip().upper()
    if source_type not in {ContractReferenceType.RENT, ContractReferenceType.LEASE}:
        return base_contract_reference_service.preview_unified_receivable_allocation(
            source_type=source_type,
            source_id=source_id,
            amount=amount,
        )

    requested_amount = _money(amount)
    if requested_amount <= MONEY_ZERO:
        raise ValidationError({"amount": "Amount must be greater than zero."})

    plan_type = PlanType.RENT if source_type == ContractReferenceType.RENT else PlanType.LEASE
    subscription = Subscription.objects.filter(pk=source_id, plan_type=plan_type).first()
    if not subscription:
        raise ValidationError({"source_id": "Rent/lease subscription was not found."})

    remaining = requested_amount
    allocations = []
    for demand in _outstanding_demands(subscription):
        outstanding = demand.outstanding_amount()
        if outstanding <= MONEY_ZERO:
            continue
        if remaining <= MONEY_ZERO:
            break
        allocated = min(outstanding, remaining)
        allocations.append(
            {
                "demand_id": demand.id,
                "demand_type": demand.demand_type,
                "due_date": demand.due_date,
                "outstanding_amount": _money_string(outstanding),
                "allocated_amount": _money_string(allocated),
            }
        )
        remaining -= allocated

    return {
        "source_type": source_type,
        "source_id": source_id,
        "requested_amount": _money_string(requested_amount),
        "allocations": allocations,
        "allocation_preview": allocations,
        "pending_dues": allocations,
        "unallocated_amount": _money_string(max(remaining, MONEY_ZERO)),
        "overpayment_warning": remaining > MONEY_ZERO,
        "mutates_data": False,
    }
