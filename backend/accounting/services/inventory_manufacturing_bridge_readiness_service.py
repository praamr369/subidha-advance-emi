from __future__ import annotations

from typing import Any

from django.apps import apps

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccountMappingPurpose
from accounting.services.accounting_bridge_readiness_service import (
    BridgeEventSpec,
    STATUS_NOT_CONFIGURED,
    build_accounting_bridge_readiness_summary,
    _source_model_exists,
    _validate_event_spec,
)
from accounting.services.payroll_bridge_readiness_service import build_accounting_bridge_readiness_with_payroll

INVENTORY_MANUFACTURING_EVENT_KEYS = {
    "inventory_purchase_receive",
    "inventory_adjustment_gain",
    "inventory_adjustment_loss",
    "inventory_delivery_out",
    "manufacturing_consumption",
    "manufacturing_output",
    "manufacturing_wastage",
}

INVENTORY_MANUFACTURING_SUPPLEMENTAL_EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="inventory_purchase_receive",
        label="Inventory purchase receive",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Inventory",
        debit_requirements=("INVENTORY_ASSET",),
        credit_requirements=("ACCOUNTS_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("ACCOUNTS_PAYABLE",),
        operator_action="Validate purchase receive inventory mapping only. Readiness does not create stock ledger or post journals.",
    ),
    BridgeEventSpec(
        event_key="inventory_adjustment_gain",
        label="Inventory adjustment gain",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Inventory",
        debit_requirements=("INVENTORY_ASSET",),
        credit_requirements=("INVENTORY_ADJUSTMENT income/clearing",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("INVENTORY_ADJUSTMENT",),
        operator_action="Validate adjustment-gain mapping only. Current canonical adjustment account is an EXPENSE/clearing account, not a dedicated income account.",
    ),
    BridgeEventSpec(
        event_key="inventory_adjustment_loss",
        label="Inventory adjustment loss",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Inventory",
        debit_requirements=("INVENTORY_ADJUSTMENT loss EXPENSE",),
        credit_requirements=("INVENTORY_ASSET",),
        debit_coa_system_codes=("INVENTORY_ADJUSTMENT",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        operator_action="Validate adjustment-loss mapping only. Readiness does not mutate stock quantities.",
    ),
    BridgeEventSpec(
        event_key="manufacturing_consumption",
        label="Manufacturing material consumption",
        source_module="manufacturing",
        source_app="manufacturing",
        source_model="ProductionJob",
        event_group="Manufacturing",
        debit_requirements=("WORK_IN_PROGRESS_INVENTORY",),
        credit_requirements=("INVENTORY_ASSET",),
        debit_coa_system_codes=("WORK_IN_PROGRESS_INVENTORY",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        operator_action="Validate WIP material consumption mapping only. Readiness does not issue materials or change production costs.",
    ),
    BridgeEventSpec(
        event_key="manufacturing_output",
        label="Manufacturing finished output",
        source_module="manufacturing",
        source_app="manufacturing",
        source_model="ProductionJob",
        event_group="Manufacturing",
        debit_requirements=("Finished goods INVENTORY_ASSET",),
        credit_requirements=("WORK_IN_PROGRESS_INVENTORY",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("WORK_IN_PROGRESS_INVENTORY",),
        operator_action="Validate finished-goods output mapping only. Readiness does not receive finished stock or post WIP closeout.",
    ),
)


def _model_exists(app_label: str, model_name: str) -> bool:
    try:
        apps.get_model(app_label, model_name, require_ready=False)
    except LookupError:
        return False
    return True


def _chart_exists(system_code: str, expected_type: str | None = None) -> bool:
    queryset = ChartOfAccount.objects.filter(system_code=system_code, is_active=True)
    if expected_type:
        queryset = queryset.filter(account_type=expected_type)
    return queryset.exists()


def _not_configured_event(
    *,
    event_key: str,
    label: str,
    source_module: str,
    source_model: str,
    event_group: str,
    debit: tuple[str, ...],
    credit: tuple[str, ...],
    reason: str,
    action: str,
) -> dict[str, Any]:
    return {
        "event_key": event_key,
        "label": label,
        "source_module": source_module,
        "source_model": source_model,
        "event_group": event_group,
        "status": STATUS_NOT_CONFIGURED,
        "can_post": False,
        "posting_mode": "AUDIT_DEFERRED",
        "debit_requirements": list(debit),
        "credit_requirements": list(credit),
        "required_finance_account_kinds": [],
        "required_coa_system_codes": [],
        "required_mapping_purposes": [],
        "debit_accounts": [],
        "credit_accounts": [],
        "finance_accounts": [],
        "blocking_reasons": [reason],
        "operator_action": action,
    }


def _inventory_delivery_out_event() -> dict[str, Any]:
    if not _model_exists("inventory", "StockLedger"):
        return _not_configured_event(
            event_key="inventory_delivery_out",
            label="Inventory delivery out",
            source_module="inventory",
            source_model="StockLedger",
            event_group="Inventory",
            debit=("COGS EXPENSE",),
            credit=("INVENTORY_ASSET",),
            reason="StockLedger source model is not configured in this repository.",
            action="Add a real stock ledger source before validating delivery-out accounting.",
        )
    if not _chart_exists("COGS", ChartOfAccountType.EXPENSE):
        return _not_configured_event(
            event_key="inventory_delivery_out",
            label="Inventory delivery out",
            source_module="inventory",
            source_model="StockLedger",
            event_group="Inventory",
            debit=("COGS EXPENSE",),
            credit=("INVENTORY_ASSET",),
            reason="No active COGS EXPENSE chart account is configured. Delivery-out accounting cannot be marked ready.",
            action="Add a dedicated COGS EXPENSE account before enabling delivery-out accounting bridge posting.",
        )
    spec = BridgeEventSpec(
        event_key="inventory_delivery_out",
        label="Inventory delivery out",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Inventory",
        debit_requirements=("COGS EXPENSE",),
        credit_requirements=("INVENTORY_ASSET",),
        debit_coa_system_codes=("COGS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        operator_action="Validate delivery-out COGS mapping only. Readiness does not deliver stock or post COGS.",
    )
    return _validate_event_spec(spec)


def _manufacturing_wastage_event() -> dict[str, Any]:
    if not _model_exists("manufacturing", "ProductionJob"):
        return _not_configured_event(
            event_key="manufacturing_wastage",
            label="Manufacturing wastage / scrap",
            source_module="manufacturing",
            source_model="ProductionJob",
            event_group="Manufacturing",
            debit=("Manufacturing wastage/loss EXPENSE",),
            credit=("INVENTORY_ASSET or WORK_IN_PROGRESS_INVENTORY",),
            reason="ProductionJob source model is not configured in this repository.",
            action="Add a real production job source before validating manufacturing wastage accounting.",
        )
    if not _chart_exists("MANUFACTURING_WASTAGE", ChartOfAccountType.EXPENSE):
        return _not_configured_event(
            event_key="manufacturing_wastage",
            label="Manufacturing wastage / scrap",
            source_module="manufacturing",
            source_model="ProductionJob",
            event_group="Manufacturing",
            debit=("Manufacturing wastage/loss EXPENSE",),
            credit=("INVENTORY_ASSET or WORK_IN_PROGRESS_INVENTORY",),
            reason="No active MANUFACTURING_WASTAGE EXPENSE chart account is configured.",
            action="Add a dedicated manufacturing wastage/loss EXPENSE account before enabling wastage bridge posting.",
        )
    spec = BridgeEventSpec(
        event_key="manufacturing_wastage",
        label="Manufacturing wastage / scrap",
        source_module="manufacturing",
        source_app="manufacturing",
        source_model="ProductionJob",
        event_group="Manufacturing",
        debit_requirements=("MANUFACTURING_WASTAGE",),
        credit_requirements=("INVENTORY_ASSET or WORK_IN_PROGRESS_INVENTORY",),
        debit_coa_system_codes=("MANUFACTURING_WASTAGE",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        operator_action="Validate manufacturing wastage mapping only. Readiness does not write scrap or journal records.",
    )
    return _validate_event_spec(spec)


def build_inventory_manufacturing_readiness_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for spec in INVENTORY_MANUFACTURING_SUPPLEMENTAL_EVENT_REGISTRY:
        if _source_model_exists(spec):
            events.append(_validate_event_spec(spec))
        else:
            events.append(
                _not_configured_event(
                    event_key=spec.event_key,
                    label=spec.label,
                    source_module=spec.source_module,
                    source_model=spec.source_model,
                    event_group=spec.event_group,
                    debit=spec.debit_requirements,
                    credit=spec.credit_requirements,
                    reason=f"{spec.source_model} source model is not configured in this repository.",
                    action="Configure the missing source module before this event can be mapped.",
                )
            )
    events.append(_inventory_delivery_out_event())
    events.append(_manufacturing_wastage_event())
    return events


def build_accounting_bridge_readiness_with_inventory_manufacturing() -> dict[str, Any]:
    payload = build_accounting_bridge_readiness_with_payroll()
    retained_events = [
        event
        for event in list(payload.get("events") or [])
        if event.get("event_key") not in INVENTORY_MANUFACTURING_EVENT_KEYS
    ]
    events = [*retained_events, *build_inventory_manufacturing_readiness_events()]
    return {
        "summary": build_accounting_bridge_readiness_summary(events=events),
        "events": events,
    }
