"""
Unified collection routing (Phase 9B).

All financial writes delegate to existing posting services.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError

from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from subscriptions.models import ContractReferenceType, PlanType, Subscription
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services import contract_reference_service as crs


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
        raise ValidationError(
            {
                "source_type": (
                    "Rent and lease unified collection is disabled until a production-safe "
                    "posting service is wired for this flow."
                )
            }
        )

    raise ValidationError({"source_type": f"Unsupported source type: {source_type}."})
