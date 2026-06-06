from __future__ import annotations

from typing import Any

from django.apps import apps

from accounting.models import FinanceAccountMappingPurpose
from accounting.services.accounting_bridge_readiness_service import (
    BridgeEventSpec,
    COLLECTION_FINANCE_ACCOUNT_KINDS,
    STATUS_NOT_CONFIGURED,
    build_accounting_bridge_readiness_summary,
    _source_model_exists,
    _validate_event_spec,
)
from accounting.services.inventory_manufacturing_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_inventory_manufacturing,
)

RETURNS_DAMAGE_CREDIT_EVENT_KEYS = {
    "customer_return",
    "sales_return",
    "credit_note_issue",
    "customer_refund",
    "customer_credit_adjustment",
    "damage_recovery",
    "security_deposit_damage_deduction",
    "refund_customer_credit",
}

RETURNS_DAMAGE_CREDIT_SUPPLEMENTAL_EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="customer_return",
        label="Customer return",
        source_module="service_desk",
        source_app="service_desk",
        source_model="ServiceDeskCase",
        event_group="Returns, Damage & Credit",
        debit_requirements=("SALES_RETURNS",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        operator_action="Validate customer return accounting mapping only. Readiness does not approve returns, restock goods, or create credit notes.",
    ),
    BridgeEventSpec(
        event_key="sales_return",
        label="Sales return",
        source_module="billing",
        source_app="billing",
        source_model="BillingCreditNote",
        event_group="Returns, Damage & Credit",
        debit_requirements=("SALES_RETURNS",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        operator_action="Validate sales return / contra adjustment mapping only. Readiness does not approve or post credit notes.",
    ),
    BridgeEventSpec(
        event_key="credit_note_issue",
        label="Credit note issue",
        source_module="billing",
        source_app="billing",
        source_model="BillingCreditNote",
        event_group="Returns, Damage & Credit",
        debit_requirements=("SALES_RETURNS or discount/adjustment",),
        credit_requirements=("CUSTOMER_RECEIVABLE or CUSTOMER_ADVANCE_UNEARNED_REVENUE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
        ),
        operator_action="Validate credit note liability/receivable mapping only. Credit note approval and posting semantics remain unchanged.",
    ),
    BridgeEventSpec(
        event_key="customer_refund",
        label="Customer refund",
        source_module="billing",
        source_app="billing",
        source_model="ReceiptDocument",
        event_group="Returns, Damage & Credit",
        debit_requirements=("CUSTOMER_ADVANCE_UNEARNED_REVENUE or CUSTOMER_RECEIVABLE",),
        credit_requirements=("Active cash/bank/UPI FinanceAccount mapped to ASSET COA",),
        debit_mapping_purposes=(
            FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
            FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
        ),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
        operator_action="Validate refund mapping only. Readiness does not approve or pay refunds.",
    ),
    BridgeEventSpec(
        event_key="customer_credit_adjustment",
        label="Customer credit adjustment",
        source_module="billing",
        source_app="billing",
        source_model="BillingCreditNote",
        event_group="Returns, Damage & Credit",
        debit_requirements=("SALES_RETURNS or CUSTOMER_RECEIVABLE",),
        credit_requirements=("CUSTOMER_ADVANCE_UNEARNED_REVENUE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,),
        operator_action="Validate customer credit adjustment mapping only. Readiness does not allocate or settle customer credit.",
    ),
    BridgeEventSpec(
        event_key="security_deposit_damage_deduction",
        label="Security deposit damage deduction",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Subscription",
        event_group="Returns, Damage & Credit",
        debit_requirements=("RentLeaseAccountingAccountMapping.deposit_liability_account",),
        credit_requirements=("RentLeaseAccountingAccountMapping.damage_recovery_income_account",),
        requires_rent_lease_mapping=True,
        operator_action="Validate security deposit damage deduction mapping only. Readiness does not deduct deposits or approve damage recovery.",
    ),
)


def _model_exists(app_label: str, model_name: str) -> bool:
    try:
        apps.get_model(app_label, model_name, require_ready=False)
    except LookupError:
        return False
    return True


def _not_configured_event(spec: BridgeEventSpec) -> dict[str, Any]:
    return {
        "event_key": spec.event_key,
        "label": spec.label,
        "source_module": spec.source_module,
        "source_model": spec.source_model,
        "event_group": spec.event_group,
        "status": STATUS_NOT_CONFIGURED,
        "can_post": False,
        "posting_mode": spec.posting_mode,
        "debit_requirements": list(spec.debit_requirements),
        "credit_requirements": list(spec.credit_requirements),
        "required_finance_account_kinds": list(spec.required_finance_account_kinds),
        "required_coa_system_codes": list(spec.required_coa_system_codes),
        "required_mapping_purposes": list(spec.required_mapping_purposes),
        "debit_accounts": [],
        "credit_accounts": [],
        "finance_accounts": [],
        "blocking_reasons": [f"{spec.source_app}.{spec.source_model} source model is not configured in this repository."],
        "operator_action": "Configure the real source workflow before this event can be mapped. Do not fake return, refund, credit, or damage readiness.",
    }


def _damage_recovery_event() -> dict[str, Any]:
    if _model_exists("subscriptions", "Subscription"):
        spec = BridgeEventSpec(
            event_key="damage_recovery",
            label="Damage recovery",
            source_module="subscriptions",
            source_app="subscriptions",
            source_model="Subscription",
            event_group="Returns, Damage & Credit",
            debit_requirements=("Receivable or deposit liability",),
            credit_requirements=("DAMAGE_RECOVERY income",),
            debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
            credit_mapping_purposes=(FinanceAccountMappingPurpose.DAMAGE_RECOVERY,),
            operator_action="Validate damage recovery income mapping only. Readiness does not assess damage or deduct deposits.",
        )
        return _validate_event_spec(spec)
    return _not_configured_event(
        BridgeEventSpec(
            event_key="damage_recovery",
            label="Damage recovery",
            source_module="subscriptions",
            source_app="subscriptions",
            source_model="Subscription",
            event_group="Returns, Damage & Credit",
            debit_requirements=("Receivable or deposit liability",),
            credit_requirements=("DAMAGE_RECOVERY income",),
        )
    )


def _refund_customer_credit_alias_event() -> dict[str, Any]:
    spec = BridgeEventSpec(
        event_key="refund_customer_credit",
        label="Refund / customer credit",
        source_module="billing",
        source_app="billing",
        source_model="ReceiptDocument",
        event_group="Returns, Damage & Credit",
        debit_requirements=("SALES_RETURNS", "CUSTOMER_RECEIVABLE"),
        credit_requirements=("Active cash/bank/UPI FinanceAccount mapped to ASSET COA",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
        operator_action="Validate refund/customer-credit mapping only. Readiness does not issue refunds or credit allocations.",
    )
    return _validate_event_spec(spec) if _source_model_exists(spec) else _not_configured_event(spec)


def build_returns_damage_credit_readiness_events() -> list[dict[str, Any]]:
    events = []
    for spec in RETURNS_DAMAGE_CREDIT_SUPPLEMENTAL_EVENT_REGISTRY:
        events.append(_validate_event_spec(spec) if _source_model_exists(spec) else _not_configured_event(spec))
    events.append(_damage_recovery_event())
    events.append(_refund_customer_credit_alias_event())
    return events


def build_accounting_bridge_readiness_with_returns_damage_credit() -> dict[str, Any]:
    payload = build_accounting_bridge_readiness_with_inventory_manufacturing()
    retained_events = [
        event
        for event in list(payload.get("events") or [])
        if event.get("event_key") not in RETURNS_DAMAGE_CREDIT_EVENT_KEYS
    ]
    events = [*retained_events, *build_returns_damage_credit_readiness_events()]
    summary = build_accounting_bridge_readiness_summary(events=events)
    period_readiness = payload.get("accounting_period_readiness") or payload.get("financial_year_readiness") or {}
    return {
        "summary": {
            **summary,
            "postable_count": sum(1 for row in events if row.get("status") == "READY" and period_readiness.get("posting_controls_ready")),
            "blocked_count": sum(1 for row in events if row.get("status") != "READY") + (0 if period_readiness.get("posting_controls_ready") else summary["ready_count"]),
        },
        "financial_year_readiness": payload.get("financial_year_readiness"),
        "accounting_period_readiness": payload.get("accounting_period_readiness"),
        "events": events,
    }
