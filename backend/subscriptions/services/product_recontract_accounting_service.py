from __future__ import annotations

from subscriptions.models import ContractRecontractEvent, ContractRecontractFinancialImpactPreview


def execute_product_recontract_accounting(
    *,
    event: ContractRecontractEvent,
    financial_preview: ContractRecontractFinancialImpactPreview,
    performed_by=None,
) -> dict:
    """
    Accounting execution boundary for recontract events.

    This service intentionally does not post journals directly here.
    Journal posting, when enabled for this flow, must stay inside accounting services.
    """
    return {
        "status": "PREVIEW_LINKED",
        "journal_posted": False,
        "entry_source": "subscriptions.services.product_recontract_accounting_service",
        "event_id": event.id,
        "financial_preview_id": financial_preview.id,
        "performed_by_user_id": getattr(performed_by, "id", None),
        "note": "No direct journal posting performed by recontract orchestration.",
    }
