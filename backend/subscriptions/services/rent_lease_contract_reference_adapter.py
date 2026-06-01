from __future__ import annotations

from subscriptions.models import ContractReferenceType
from subscriptions.services import contract_reference_service as base_contract_reference_service
from subscriptions.services.rent_lease_collection_workflow_service import build_receivable_result


def resolve_contract_reference_row(reference, *, audience: str = "admin") -> dict[str, object]:
    if reference.contract_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE} and reference.subscription_id:
        payload = build_receivable_result(reference, audience=audience)
        return {
            "contract_reference_id": payload.get("contract_reference_id"),
            "source_type": payload.get("source_type"),
            "source_id": payload.get("source_id"),
            "route": payload.get("collection_route"),
            "primary_action": payload.get("primary_action"),
            "allowed_actions": payload.get("allowed_actions") or [],
            "disabled_reason": payload.get("disabled_reason"),
            "demand_id": payload.get("demand_id"),
            "demand_type": payload.get("demand_type"),
            "collection_workflow": payload.get("collection_workflow"),
        }
    return base_contract_reference_service.resolve_contract_reference_row(reference, audience=audience)
