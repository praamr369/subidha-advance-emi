from __future__ import annotations

from typing import Any

from accounting.models import FinanceAccountMappingPurpose
from accounting.services.accounting_bridge_readiness_service import (
    BridgeEventSpec,
    build_accounting_bridge_readiness_summary,
    _source_model_exists,
    _validate_event_spec,
)
from accounting.services.commission_payout_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_commission_payout,
)


PURCHASE_VENDOR_SUPPLEMENTAL_EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="purchase_inventory_receive",
        label="Purchase inventory receive",
        source_module="inventory",
        source_app="inventory",
        source_model="GoodsReceipt",
        event_group="Purchase & Vendors",
        debit_requirements=("INVENTORY_ASSET",),
        credit_requirements=("ACCOUNTS_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("ACCOUNTS_PAYABLE",),
        operator_action="Validate GRN/inventory receive mapping only. Readiness does not receive stock or post journals.",
    ),
    BridgeEventSpec(
        event_key="vendor_return",
        label="Vendor return",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Purchase & Vendors",
        debit_requirements=("ACCOUNTS_PAYABLE or return clearing",),
        credit_requirements=("INVENTORY_ASSET or PURCHASE_RETURN",),
        debit_coa_system_codes=("ACCOUNTS_PAYABLE",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        operator_action="Validate vendor-return mapping only. Return source records and stock movements remain authoritative.",
    ),
    BridgeEventSpec(
        event_key="purchase_expense",
        label="Purchase expense",
        source_module="inventory",
        source_app="inventory",
        source_model="PurchaseBill",
        event_group="Purchase & Vendors",
        debit_requirements=("PURCHASE_EXPENSE",),
        credit_requirements=("ACCOUNTS_PAYABLE",),
        debit_coa_system_codes=("PURCHASE_EXPENSE",),
        credit_coa_system_codes=("ACCOUNTS_PAYABLE",),
        operator_action="Validate expense-style purchase mapping only. This does not change inventory-backed purchase bill behavior.",
    ),
)


def build_purchase_vendor_readiness_events() -> list[dict[str, Any]]:
    return [
        _validate_event_spec(spec)
        for spec in PURCHASE_VENDOR_SUPPLEMENTAL_EVENT_REGISTRY
        if _source_model_exists(spec)
    ]


def build_accounting_bridge_readiness_with_purchase_vendor() -> dict[str, Any]:
    payload = build_accounting_bridge_readiness_with_commission_payout()
    events = list(payload.get("events") or [])
    existing_keys = {event.get("event_key") for event in events}
    for event in build_purchase_vendor_readiness_events():
        if event.get("event_key") not in existing_keys:
            events.append(event)
            existing_keys.add(event.get("event_key"))
    return {
        "summary": build_accounting_bridge_readiness_summary(events=events),
        "events": events,
    }
