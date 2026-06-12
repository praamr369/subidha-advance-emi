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
from django.db import IntegrityError, transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    ContractReferenceType,
    MONEY_ZERO,
    PaymentMethod,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    RentLeaseDepositTransaction,
    RentLeaseDepositTransactionType,
    Subscription,
    q2,
)
from subscriptions.models_rent_lease_collection import RentLeaseCollection, RentLeaseCollectionStatus
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
    "Operational source collection and mapping are ready. Accounting bridge posting "
    "remains audit-deferred until approval is enabled."
)


def _money(value) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _money_string(value) -> str:
    return f"{_money(value):.2f}"


def _json_date(value) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def _normal_reference(value: str | None) -> str:
    return (value or "").strip().upper()


def _normal_method(value: str | None) -> str:
    return (value or PaymentMethod.CASH).strip().upper()


def _payment_date(value):
    return value or timezone.localdate()


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
        "payment_method": _normal_method(payment_method),
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


def _find_existing_monthly_collection(
    *,
    subscription: Subscription,
    amount_q: Decimal,
    payment_method: str,
    finance_account_id,
    payment_date=None,
    reference_no: str = "",
    idempotency_key: str = "",
    demand_id=None,
) -> RentLeaseCollection | None:
    normalized_reference = _normal_reference(reference_no)
    normalized_idempotency = (idempotency_key or "").strip()
    if not normalized_reference and not normalized_idempotency:
        return None

    qs = RentLeaseCollection.objects.select_related("demand", "subscription").filter(status=RentLeaseCollectionStatus.ACTIVE)
    existing = None
    if normalized_idempotency:
        existing = qs.filter(idempotency_key=normalized_idempotency).first()
    if existing is None and normalized_reference:
        existing = qs.filter(external_reference_no=normalized_reference).first()
    if existing is None:
        return None

    errors = {}
    if existing.subscription_id != subscription.id:
        errors["subscription"] = "Existing rent/lease collection evidence belongs to another subscription."
    if existing.plan_type != subscription.plan_type:
        errors["plan_type"] = "Existing rent/lease collection evidence has a different plan type."
    if _money(existing.amount) != amount_q:
        errors["amount"] = "Existing rent/lease collection evidence has a different amount."
    if existing.payment_method != payment_method:
        errors["payment_method"] = "Existing rent/lease collection evidence has a different payment method."
    if finance_account_id and existing.finance_account_id != int(finance_account_id):
        errors["finance_account"] = "Existing rent/lease collection evidence has a different finance account."
    if payment_date and existing.payment_date != payment_date:
        errors["payment_date"] = "Existing rent/lease collection evidence has a different payment date."
    if demand_id is not None and existing.demand_id != int(demand_id):
        errors["demand"] = "Existing rent/lease collection evidence belongs to another demand."
    if errors:
        raise ValidationError(errors)
    return existing


def _latest_monthly_collection(subscription: Subscription) -> RentLeaseCollection | None:
    return (
        RentLeaseCollection.objects.filter(subscription=subscription)
        .order_by("-payment_date", "-created_at", "-id")
        .first()
    )


def _source_payload(collection: RentLeaseCollection | None) -> dict[str, object]:
    if collection is None:
        return {
            "latest_collection_id": None,
            "latest_collection_number": "",
            "latest_collection_amount": "0.00",
            "latest_collection_date": None,
            "latest_collection_method": "",
            "latest_collection_finance_account_id": None,
        }
    return {
        "latest_collection_id": collection.id,
        "latest_collection_number": collection.collection_number,
        "latest_collection_amount": _money_string(collection.amount),
        "latest_collection_date": collection.payment_date,
        "latest_collection_method": collection.payment_method,
        "latest_collection_finance_account_id": collection.finance_account_id,
    }


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
    idempotency_key: str = "",
) -> RentLeaseBillingDemand:
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Rent/lease monthly demand collection is available only for RENT/LEASE subscriptions.")
    if not finance_account_id:
        raise ValidationError({"finance_account": "Finance account is required for rent/lease collection evidence."})

    amount_q = _money(amount)
    if amount_q <= MONEY_ZERO:
        raise ValidationError({"amount": "Collected amount must be greater than zero."})

    normalized_payment_method = _normal_method(payment_method)
    resolved_payment_date = _payment_date(payment_date)
    existing = _find_existing_monthly_collection(
        subscription=subscription,
        amount_q=amount_q,
        payment_method=normalized_payment_method,
        finance_account_id=finance_account_id,
        payment_date=resolved_payment_date,
        reference_no=reference_no,
        idempotency_key=idempotency_key,
        demand_id=demand_id,
    )
    if existing is not None:
        demand = existing.demand
        setattr(demand, "_rent_lease_collection", existing)
        setattr(demand, "_rent_lease_collection_created", False)
        return demand

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
        payment_method=normalized_payment_method,
        payment_date=resolved_payment_date,
        branch_id=branch_id,
        cash_counter_id=cash_counter_id,
        note=note,
        demand=demand,
        amount=amount_q,
    )
    contract_reference = base_contract_reference_service.ensure_contract_reference_for_subscription(subscription)
    try:
        collection = RentLeaseCollection.objects.create(
            demand=demand,
            subscription=subscription,
            contract_reference=contract_reference,
            customer=subscription.customer,
            plan_type=subscription.plan_type,
            amount=amount_q,
            payment_date=resolved_payment_date,
            payment_method=normalized_payment_method,
            finance_account_id=finance_account_id,
            external_reference_no=_normal_reference(reference_no),
            idempotency_key=(idempotency_key or "").strip(),
            note=note or "",
            metadata=metadata,
            created_by=performed_by,
        )
        created = True
    except IntegrityError:
        collection = _find_existing_monthly_collection(
            subscription=subscription,
            amount_q=amount_q,
            payment_method=normalized_payment_method,
            finance_account_id=finance_account_id,
            payment_date=resolved_payment_date,
            reference_no=reference_no,
            idempotency_key=idempotency_key,
            demand_id=demand.id,
        )
        if collection is None:
            raise
        created = False

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "event": "RENT_LEASE_MONTHLY_DEMAND_COLLECTED",
            "rent_lease_collection_id": collection.id,
            "rent_lease_collection_number": collection.collection_number,
            **metadata,
        },
    )
    sync_rent_lease_monthly_income(subscription=subscription, amount=amount_q, performed_by=performed_by)
    setattr(demand, "_rent_lease_collection", collection)
    setattr(demand, "_rent_lease_collection_created", created)
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

    latest_collection = _latest_monthly_collection(subscription)
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
        **_source_payload(latest_collection),
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
        "latest_collection_id": position.get("latest_collection_id"),
        "latest_collection_number": position.get("latest_collection_number"),
        "latest_collection_amount": position.get("latest_collection_amount"),
        "latest_collection_date": position.get("latest_collection_date"),
        "latest_collection_method": position.get("latest_collection_method"),
        "latest_collection_finance_account_id": position.get("latest_collection_finance_account_id"),
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
