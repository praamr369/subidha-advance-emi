from __future__ import annotations

from subscriptions.models import ContractRecontractEvent, ContractRecontractFinancialImpactPreview
from subscriptions.services.reconciliation_service import reconcile_subscription


def execute_product_recontract_reconciliation(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview,
    performed_by=None,
) -> dict:
    """
    Reconciliation execution boundary for recontract events.

    Mutations to reconciliation records must go through reconciliation services.
    This phase stores deterministic snapshot evidence only.
    """
    snapshot = reconcile_subscription(event.subscription)
    return {
        "status": "PREVIEW_LINKED",
        "reconciliation_mutation_performed": False,
        "entry_source": "subscriptions.services.product_recontract_reconciliation_service",
        "event_id": event.id,
        "financial_preview_id": financial_preview.id,
        "performed_by_user_id": getattr(performed_by, "id", None),
        "subscription_reconciliation_snapshot": snapshot,
    }
