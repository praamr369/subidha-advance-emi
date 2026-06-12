from __future__ import annotations

from typing import Any

from django.apps import apps

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccountMappingPurpose
from accounting.services.accounting_bridge_readiness_service import (
    BridgeEventSpec,
    COLLECTION_FINANCE_ACCOUNT_KINDS,
    POSTING_MODE_AUDIT_DEFERRED,
    STATUS_NOT_CONFIGURED,
    build_accounting_bridge_readiness_summary,
    _source_model_exists,
    _validate_event_spec,
)
from accounting.services.purchase_vendor_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_purchase_vendor,
)


PAYROLL_SUPPLEMENTAL_EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="salary_accrual",
        label="Salary accrual",
        source_module="accounting",
        source_app="accounting",
        source_model="SalarySheet",
        event_group="HR & Payroll",
        debit_requirements=("SALARY_EXPENSE or WAGES_EXPENSE",),
        credit_requirements=("SALARY_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.SALARY_EXPENSE,),
        credit_coa_system_codes=("SALARY_PAYABLE",),
        operator_action="Validate payroll accrual mapping only. Posting is explicit from concrete SalarySheet bridge candidates and does not edit payroll, staff, attendance, staff advance, or payment records.",
    ),
    BridgeEventSpec(
        event_key="salary_payable",
        label="Salary payable accrual",
        source_module="accounting",
        source_app="accounting",
        source_model="SalarySheet",
        event_group="HR & Payroll",
        debit_requirements=("SALARY_EXPENSE",),
        credit_requirements=("SALARY_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.SALARY_EXPENSE,),
        credit_coa_system_codes=("SALARY_PAYABLE",),
        operator_action="Validate payroll accrual mapping only. Readiness does not calculate payroll or post salary journals.",
    ),
    BridgeEventSpec(
        event_key="expense_claim_payment",
        label="Expense claim payment",
        source_module="accounting",
        source_app="accounting",
        source_model="EmployeeExpenseClaimPayment",
        event_group="HR & Payroll",
        debit_requirements=("Employee expense claim EXPENSE account",),
        credit_requirements=("Active cash/bank/UPI FinanceAccount mapped to active ASSET COA",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
        operator_action="Validate expense claim payment mapping only. Readiness does not approve claims or create payment journals.",
    ),
)


def _model_exists(app_label: str, model_name: str) -> bool:
    try:
        apps.get_model(app_label, model_name, require_ready=False)
    except LookupError:
        return False
    return True


def _not_configured_event(*, event_key: str, label: str, source_model: str, debit: tuple[str, ...], credit: tuple[str, ...], action: str) -> dict[str, Any]:
    return {
        "event_key": event_key,
        "label": label,
        "source_module": "accounting",
        "source_model": source_model,
        "event_group": "HR & Payroll",
        "status": STATUS_NOT_CONFIGURED,
        "can_post": False,
        "posting_mode": POSTING_MODE_AUDIT_DEFERRED,
        "debit_requirements": list(debit),
        "credit_requirements": list(credit),
        "required_finance_account_kinds": [],
        "required_coa_system_codes": [],
        "required_mapping_purposes": [],
        "debit_accounts": [],
        "credit_accounts": [],
        "finance_accounts": [],
        "blocking_reasons": [f"{source_model} source model is not configured in this repository."],
        "operator_action": action,
    }


def _expense_claim_payment_event() -> dict[str, Any]:
    base_spec = next(spec for spec in PAYROLL_SUPPLEMENTAL_EVENT_REGISTRY if spec.event_key == "expense_claim_payment")
    event = _validate_event_spec(base_spec)
    active_expense_accounts = list(
        ChartOfAccount.objects.filter(account_type=ChartOfAccountType.EXPENSE, is_active=True)
        .order_by("code", "id")[:5]
    )
    if active_expense_accounts:
        existing = {(account.get("id"), account.get("requirement")) for account in event["debit_accounts"]}
        for account in active_expense_accounts:
            key = (account.id, "Employee expense claim EXPENSE account")
            if key in existing:
                continue
            event["debit_accounts"].append(
                {
                    "id": account.id,
                    "code": account.code,
                    "name": account.name,
                    "account_type": account.account_type,
                    "type": account.account_type,
                    "system_code": account.system_code,
                    "is_active": account.is_active,
                    "allow_manual_posting": account.allow_manual_posting,
                    "requirement": "Employee expense claim EXPENSE account",
                    "purpose": None,
                }
            )
    else:
        if event["status"] == "READY":
            event["status"] = STATUS_NOT_CONFIGURED
        event["blocking_reasons"].append("No active EXPENSE Chart of Account is available for employee expense claims.")
        event["operator_action"] = "Create or activate an EXPENSE chart account before paying employee expense claims."
    return event


def build_payroll_readiness_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for spec in PAYROLL_SUPPLEMENTAL_EVENT_REGISTRY:
        if not _source_model_exists(spec):
            events.append(
                _not_configured_event(
                    event_key=spec.event_key,
                    label=spec.label,
                    source_model=spec.source_model,
                    debit=spec.debit_requirements,
                    credit=spec.credit_requirements,
                    action="Configure the missing payroll source module before this event can be mapped.",
                )
            )
            continue
        if spec.event_key == "expense_claim_payment":
            events.append(_expense_claim_payment_event())
        else:
            events.append(_validate_event_spec(spec))

    if _model_exists("accounting", "StaffAdvance"):
        # Reserved for a future real StaffAdvance source model. No source model exists in the current repo state.
        pass
    else:
        events.append(
            _not_configured_event(
                event_key="staff_advance",
                label="Staff advance",
                source_model="StaffAdvance",
                debit=("STAFF_ADVANCE asset",),
                credit=("Active cash/bank/UPI FinanceAccount mapped to active ASSET COA",),
                action="No StaffAdvance source model exists. Do not show or post staff advances until a real auditable source workflow is added.",
            )
        )
    return events


def build_accounting_bridge_readiness_with_payroll() -> dict[str, Any]:
    payload = build_accounting_bridge_readiness_with_purchase_vendor()
    events = list(payload.get("events") or [])
    existing_keys = {event.get("event_key") for event in events}
    for event in build_payroll_readiness_events():
        if event.get("event_key") not in existing_keys:
            events.append(event)
            existing_keys.add(event.get("event_key"))
    return {
        "summary": build_accounting_bridge_readiness_summary(events=events),
        "events": events,
    }
