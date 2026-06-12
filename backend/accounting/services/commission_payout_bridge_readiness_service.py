from __future__ import annotations

from typing import Any

from accounting.models import FinanceAccountMappingPurpose
from accounting.services.accounting_bridge_readiness_service import (
    BridgeEventSpec,
    COLLECTION_FINANCE_ACCOUNT_KINDS,
    build_accounting_bridge_readiness,
    build_accounting_bridge_readiness_summary,
    _source_model_exists,
    _validate_event_spec,
)


COMMISSION_PAYOUT_SUPPLEMENTAL_EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="commission_approval",
        label="Commission approval",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Commission",
        event_group="Commission",
        debit_requirements=("COMMISSION_EXPENSE",),
        credit_requirements=("COMMISSION_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_EXPENSE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_PAYABLE,),
        operator_action="Validate approval-stage commission liability mapping only. Approval does not post journals from readiness.",
    ),
    BridgeEventSpec(
        event_key="commission_payout",
        label="Commission payout",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="CommissionPayoutBatch",
        event_group="Commission",
        debit_requirements=("COMMISSION_PAYABLE",),
        credit_requirements=("Active cash/bank/UPI FinanceAccount mapped to active ASSET COA",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_PAYABLE,),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
        operator_action="Validate payout payment mapping only. Non-dry-run bridge execution still requires posting_approved=true.",
    ),
)


def build_commission_payout_readiness_events() -> list[dict[str, Any]]:
    return [
        _validate_event_spec(spec)
        for spec in COMMISSION_PAYOUT_SUPPLEMENTAL_EVENT_REGISTRY
        if _source_model_exists(spec)
    ]


def build_accounting_bridge_readiness_with_commission_payout() -> dict[str, Any]:
    payload = build_accounting_bridge_readiness()
    events = list(payload.get("events") or [])
    existing_keys = {event.get("event_key") for event in events}
    for event in build_commission_payout_readiness_events():
        if event.get("event_key") not in existing_keys:
            events.append(event)
            existing_keys.add(event.get("event_key"))
    return {
        "summary": build_accounting_bridge_readiness_summary(events=events),
        "events": events,
    }
