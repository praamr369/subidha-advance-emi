"""
Unified collection routing (Phase 9B).

All financial writes delegate to existing posting services.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError

from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from subscriptions.models import ContractReferenceType, PlanType, RentLeaseDemandType, Subscription
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services import contract_reference_service as crs
from subscriptions.services.rent_lease_collection_workflow_service import (
    collect_rent_lease_monthly_demand,
    collect_security_deposit_with_metadata,
    rent_lease_receivable_position,
)


def _payment_collection_idempotency_key(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    return f"PAYMENT:{value}"


def _fallback_collection_idempotency_key(
    *,
    source_type: str,
    source_id: int,
    amount,
    payment_method: str,
    finance_account_id: int,
    reference_no: str | None,
    payment_date,
) -> str:
    return "ROUTED-COLLECTION:" + "|".join(
        [
            (source_type or "").strip().upper(),
            str(source_id),
            str(amount),
            (payment_method or "").strip().upper(),
            str(finance_account_id),
            (reference_no or "").strip(),
            str(payment_date or ""),
        ]
    )


def route_collection(
    *,
    source_type: str,
    source_id: int,
    collected_by,
    amount,
    payment_method: str,
    finance_account_id: int,
    reference_no: str | None = None,
    payment_date=None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    note: str | None = None,
    contract_reference_id: int | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Dispatch unified collection to the correct posting service."""
    source_type = (source_type or "").strip().upper()
    payment_method = (payment_method or "CASH").strip().upper()

    audit_kwargs = {}
    if contract_reference_id is not None:
        audit_kwargs["contract_reference_id"] = contract_reference_id
        audit_kwargs["unified_collection_source_type"] = source_type
        audit_kwargs["unified_collection_source_id"] = source_id

    if source_type == ContractReferenceType.ADVANCE_EMI:
        subscription = (
            Subscription.objects.select_related("customer", "branch")
            .filter(pk=source_id, plan_type=PlanType.EMI)
            .first()
        )
        if not subscription:
            raise ValidationError({"source_id": "Advance EMI subscription was not found."})
        position = crs._advance_emi_position(subscription)
        emi_id = position.get("emi_id")
        if not emi_id:
            raise ValidationError("No collectible EMI is currently pending.")
        payment_idempotency_key = _payment_collection_idempotency_key(
            idempotency_key
        ) or _fallback_collection_idempotency_key(
            source_type=source_type,
            source_id=source_id,
            amount=amount,
            payment_method=payment_method,
            finance_account_id=finance_account_id,
            reference_no=reference_no,
            payment_date=payment_date,
        )
        result = record_emi_payment(
            emi_id=emi_id,
            amount=amount,
            collected_by=collected_by,
            method=payment_method,
            reference_no=reference_no,
            note=note,
            payment_date=payment_date,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
            finance_account_id=finance_account_id,
            idempotency_key=payment_idempotency_key,
            **audit_kwargs,
        )
        return {
            "source_type": source_type,
            "created": result.get("created", True),
            "payment_id": result["payment"].id,
            "emi_id": result["emi"].id,
            "subscription_id": result["subscription"].id,
            "message": "Advance EMI collection posted through the existing payment service.",
        }

    if source_type == ContractReferenceType.DIRECT_SALE:
        result = collect_direct_sale_payment(
            direct_sale_id=source_id,
            amount=amount,
            collected_by=collected_by,
            receipt_date=payment_date,
            finance_account_id=finance_account_id,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
            reference_no=reference_no,
            notes=note,
            **audit_kwargs,
        )
        return {
            "source_type": source_type,
            "created": result.get("created", True),
            "receipt_id": result["receipt"].id,
            "direct_sale_id": result["direct_sale"].id,
            "invoice_id": result["invoice"].id,
            "message": "Direct-sale collection posted through the existing retail receipt service.",
        }

    if source_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE}:
        plan_type = PlanType.RENT if source_type == ContractReferenceType.RENT else PlanType.LEASE
        subscription = Subscription.objects.filter(pk=source_id, plan_type=plan_type).first()
        if not subscription:
            raise ValidationError({"source_id": "Rent/lease subscription was not found."})
        position = rent_lease_receivable_position(subscription)
        demand_id = position.get("demand_id")
        demand_type = position.get("demand_type")
        if not position.get("is_collectible") or not demand_id:
            raise ValidationError(position.get("disabled_reason") or "No collectible rent/lease demand is currently pending.")
        common_kwargs = {
            "subscription": subscription,
            "amount": amount,
            "performed_by": collected_by,
            "reference_no": reference_no or "",
            "finance_account_id": finance_account_id,
            "payment_method": payment_method,
            "payment_date": payment_date,
            "branch_id": branch_id,
            "cash_counter_id": cash_counter_id,
            "note": note or "",
        }
        if demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
            demand = collect_security_deposit_with_metadata(**common_kwargs)
        else:
            demand = collect_rent_lease_monthly_demand(demand_id=demand_id, **common_kwargs)
        return {
            "source_type": source_type,
            "created": True,
            "subscription_id": subscription.id,
            "demand_id": demand.id,
            "demand_type": demand.demand_type,
            "message": "Rent/lease collection recorded against the authoritative demand source.",
        }

    raise ValidationError({"source_type": f"Unsupported source type: {source_type}."})
