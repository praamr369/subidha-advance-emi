from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    SYSTEM_LEDGER_POSTING_PROFILE_NAME,
)
from accounting.services.finance_account_readiness import (
    chart_account_allowed_for_collection,
    chart_account_is_posting_ready,
    finance_account_readiness,
)


OPERATOR_BLOCKED_COPY = "Blocked from collection selectors until COA mapping is posting-ready."
SYSTEM_CONTROL_COPY = "System/control accounts are diagnostic only and cannot receive customer collections."
LEAF_ASSET_ACTION = "Choose a posting-enabled leaf ASSET chart account in Accounting Setup."
RENT_LEASE_DEFERRED_COPY = (
    "Rent/lease collection setup is tracked, but collection action is deferred until backend demand collection is enabled."
)


@dataclass(frozen=True)
class MatrixModuleSpec:
    module_key: str
    label: str
    workflow_active: bool
    collection_required: bool
    required_kinds: tuple[str, ...]
    required_mapping_keys: tuple[str, ...]
    deferred_reason: str | None = None


MODULE_SPECS: tuple[MatrixModuleSpec, ...] = (
    MatrixModuleSpec(
        module_key="emi_collection",
        label="Advance EMI Collection",
        workflow_active=True,
        collection_required=True,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("CUSTOMER_RECEIVABLE", "EMI_INCOME", "EMI_COLLECTION_CLEARING"),
    ),
    MatrixModuleSpec(
        module_key="direct_sale_collection",
        label="Direct-sale Collection",
        workflow_active=True,
        collection_required=True,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("CUSTOMER_RECEIVABLE", "SALES_REVENUE", "DIRECT_SALE_INCOME"),
    ),
    MatrixModuleSpec(
        module_key="customer_advance_collection",
        label="Customer Advance",
        workflow_active=True,
        collection_required=True,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("CUSTOMER_ADVANCE_UNEARNED_REVENUE",),
    ),
    MatrixModuleSpec(
        module_key="rent_lease_collection",
        label="Rent / Lease Collection",
        workflow_active=False,
        collection_required=False,
        required_kinds=(),
        required_mapping_keys=("RENT_INCOME", "LEASE_INCOME", "SECURITY_DEPOSIT_LIABILITY"),
        deferred_reason=RENT_LEASE_DEFERRED_COPY,
    ),
    MatrixModuleSpec(
        module_key="security_deposit_collection",
        label="Security Deposit",
        workflow_active=False,
        collection_required=False,
        required_kinds=(),
        required_mapping_keys=("SECURITY_DEPOSIT_LIABILITY",),
        deferred_reason="Security deposit setup is tracked; collection action must remain backend-controlled until deposit collection is enabled.",
    ),
    MatrixModuleSpec(
        module_key="refund_payout",
        label="Refund / Customer Credit",
        workflow_active=True,
        collection_required=False,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("CUSTOMER_RECEIVABLE", "SALES_RETURNS"),
    ),
    MatrixModuleSpec(
        module_key="commission_payout",
        label="Commission Payout",
        workflow_active=True,
        collection_required=False,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("COMMISSION_PAYABLE", "COMMISSION_EXPENSE", "PARTNER_COMMISSION_PAYABLE", "PARTNER_COMMISSION_EXPENSE"),
    ),
    MatrixModuleSpec(
        module_key="vendor_payment",
        label="Vendor Payment",
        workflow_active=True,
        collection_required=False,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("ACCOUNTS_PAYABLE",),
    ),
    MatrixModuleSpec(
        module_key="purchase_receipt",
        label="Purchase / Inventory",
        workflow_active=True,
        collection_required=False,
        required_kinds=(),
        required_mapping_keys=("INVENTORY_ASSET", "PURCHASE_EXPENSE", "INPUT_GST"),
    ),
    MatrixModuleSpec(
        module_key="inventory_adjustment",
        label="Inventory Adjustment",
        workflow_active=True,
        collection_required=False,
        required_kinds=(),
        required_mapping_keys=("INVENTORY_ASSET", "INVENTORY_ADJUSTMENT"),
    ),
    MatrixModuleSpec(
        module_key="reconciliation_clearing",
        label="Reconciliation Clearing",
        workflow_active=True,
        collection_required=False,
        required_kinds=(FinanceAccountKind.CASH, FinanceAccountKind.BANK, FinanceAccountKind.UPI),
        required_mapping_keys=("CUSTOMER_RECEIVABLE", "EMI_COLLECTION_CLEARING"),
    ),
)


def _chart_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    is_posting_ready = chart_account_is_posting_ready(account)
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
        "is_active": account.is_active,
        "allow_manual_posting": account.allow_manual_posting,
        "is_posting_ready": is_posting_ready,
        "is_group_control": bool(account.children.exists() or not account.allow_manual_posting),
        "allowed_for_collection": chart_account_allowed_for_collection(account),
        "parent": (
            {
                "id": account.parent_id,
                "code": getattr(account.parent, "code", None),
                "name": getattr(account.parent, "name", None),
            }
            if account.parent_id
            else None
        ),
    }


def _is_system_finance_account(account: FinanceAccount) -> bool:
    return (not account.is_real_settlement_account) or (account.name or "").strip().lower() == SYSTEM_LEDGER_POSTING_PROFILE_NAME


def _finance_account_payload(account: FinanceAccount) -> dict[str, Any]:
    readiness = finance_account_readiness(account)
    is_system = _is_system_finance_account(account)
    selectable = bool(readiness.collection_ready and not is_system)
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "branch": (
            {
                "id": account.branch_id,
                "code": getattr(account.branch, "code", None),
                "name": getattr(account.branch, "name", None),
            }
            if account.branch_id
            else None
        ),
        "mapped_chart_account": _chart_payload(getattr(account, "chart_account", None)),
        "is_active": account.is_active,
        "is_real_settlement_account": account.is_real_settlement_account,
        "is_system_or_control": is_system,
        "collection_ready": readiness.collection_ready,
        "is_selectable_collection_account": selectable,
        "collection_blocker_reason": (
            SYSTEM_CONTROL_COPY if is_system else readiness.collection_blocker_reason
        ),
        "recommended_action": None if selectable else (readiness.recommended_action or LEAF_ASSET_ACTION),
    }


def _posting_profile_payload(profile: AccountingPostingProfile) -> dict[str, Any]:
    chart = getattr(profile, "chart_account", None)
    return {
        "id": profile.id,
        "key": profile.key,
        "label": profile.label,
        "description": profile.description,
        "is_active": profile.is_active,
        "is_system_only": profile.is_system_only,
        "chart_account": _chart_payload(chart),
        "ready": bool(profile.is_active and chart and chart.is_active),
    }


def _mapping_payload(mapping: FinanceAccountCoaMapping) -> dict[str, Any]:
    return {
        "id": mapping.id,
        "purpose": mapping.purpose,
        "is_default": mapping.is_default,
        "is_active": mapping.is_active,
        "finance_account": _finance_account_payload(mapping.finance_account),
        "chart_account": _chart_payload(mapping.chart_account),
        "ready": bool(mapping.is_active and mapping.chart_account and mapping.chart_account.is_active),
    }


def _lookup_required_mapping(key: str, mappings_by_purpose: dict[str, list[FinanceAccountCoaMapping]], profiles_by_key: dict[str, AccountingPostingProfile]) -> dict[str, Any]:
    mapping = next((m for m in mappings_by_purpose.get(key, []) if m.is_active), None)
    if mapping is not None:
        payload = _mapping_payload(mapping)
        return {
            "key": key,
            "label": key.replace("_", " ").title(),
            "kind": "finance_account_mapping",
            "ready": payload["ready"],
            "mapping": payload,
            "blocker_reason": None if payload["ready"] else "Mapping is inactive or points to an inactive chart account.",
            "recommended_action": None if payload["ready"] else "Review the mapping in Accounting Setup.",
        }
    profile = profiles_by_key.get(key)
    if profile is not None:
        payload = _posting_profile_payload(profile)
        return {
            "key": key,
            "label": profile.label or key.replace("_", " ").title(),
            "kind": "posting_profile",
            "ready": payload["ready"],
            "posting_profile": payload,
            "blocker_reason": None if payload["ready"] else "System posting profile is inactive or mapped to an inactive chart account.",
            "recommended_action": None if payload["ready"] else "Run Accounting Setup defaults or repair the posting profile mapping.",
        }
    return {
        "key": key,
        "label": key.replace("_", " ").title(),
        "kind": "missing_mapping",
        "ready": False,
        "blocker_reason": "Required accounting mapping or posting profile is missing.",
        "recommended_action": "Run Accounting Setup defaults or map the required account before marking this workflow ready.",
    }


def _collection_requirement(kind: str, finance_accounts: list[dict[str, Any]]) -> dict[str, Any]:
    accounts = [row for row in finance_accounts if row["kind"] == kind and row["is_real_settlement_account"]]
    ready = [row for row in accounts if row["is_selectable_collection_account"]]
    blocked = [row for row in accounts if not row["is_selectable_collection_account"]]
    return {
        "key": f"{kind.lower()}_collection_account",
        "label": f"{kind} collection account",
        "kind": "operational_collection_account",
        "ready": bool(ready),
        "ready_accounts": ready,
        "blocked_accounts": blocked,
        "blocker_reason": None if ready else f"No posting-ready {kind} collection account is selectable.",
        "recommended_action": None if ready else LEAF_ASSET_ACTION,
    }


def build_accounting_setup_matrix() -> dict[str, Any]:
    finance_account_models = list(
        FinanceAccount.objects.select_related("chart_account", "chart_account__parent", "branch")
        .prefetch_related("chart_account__children")
        .order_by("kind", "name", "id")
    )
    finance_accounts = [_finance_account_payload(account) for account in finance_account_models]

    chart_accounts = [
        _chart_payload(account)
        for account in ChartOfAccount.objects.select_related("parent").prefetch_related("children").order_by("code", "id")
    ]
    chart_accounts = [row for row in chart_accounts if row is not None]

    posting_profiles = list(
        AccountingPostingProfile.objects.select_related("chart_account", "chart_account__parent")
        .prefetch_related("chart_account__children")
        .order_by("key", "id")
    )
    posting_profile_rows = [_posting_profile_payload(profile) for profile in posting_profiles]
    profiles_by_key = {profile.key: profile for profile in posting_profiles}

    mappings = list(
        FinanceAccountCoaMapping.objects.select_related("finance_account", "finance_account__chart_account", "finance_account__branch", "chart_account", "chart_account__parent")
        .prefetch_related("finance_account__chart_account__children", "chart_account__children")
        .order_by("purpose", "-is_default", "id")
    )
    mappings_by_purpose: dict[str, list[FinanceAccountCoaMapping]] = {}
    for mapping in mappings:
        mappings_by_purpose.setdefault(mapping.purpose, []).append(mapping)

    modules: list[dict[str, Any]] = []
    for spec in MODULE_SPECS:
        required_rows: list[dict[str, Any]] = []
        if spec.collection_required or spec.required_kinds:
            for kind in spec.required_kinds:
                required_rows.append(_collection_requirement(kind, finance_accounts))
        for key in spec.required_mapping_keys:
            required_rows.append(_lookup_required_mapping(key, mappings_by_purpose, profiles_by_key))

        ready_count = sum(1 for row in required_rows if row.get("ready"))
        blocked_rows = [row for row in required_rows if not row.get("ready")]
        blockers = [row.get("blocker_reason") for row in blocked_rows if row.get("blocker_reason")]
        recommended_actions = []
        for row in blocked_rows:
            action = row.get("recommended_action")
            if action and action not in recommended_actions:
                recommended_actions.append(action)
        if spec.deferred_reason and spec.deferred_reason not in blockers:
            blockers.insert(0, spec.deferred_reason)
        if spec.deferred_reason and spec.deferred_reason not in recommended_actions:
            recommended_actions.insert(0, spec.deferred_reason)

        if not spec.workflow_active:
            module_status = "DEFERRED"
        elif blocked_rows and ready_count > 0:
            module_status = "PARTIAL"
        elif blocked_rows:
            module_status = "BLOCKED"
        else:
            module_status = "READY"

        modules.append(
            {
                "module_key": spec.module_key,
                "label": spec.label,
                "status": module_status,
                "workflow_active": spec.workflow_active,
                "collection_action_enabled": bool(spec.workflow_active and spec.collection_required and ready_count > 0),
                "deferred_reason": spec.deferred_reason,
                "required_mappings": required_rows,
                "ready_count": ready_count,
                "blocked_count": len(blocked_rows),
                "blockers": blockers,
                "recommended_actions": recommended_actions,
            }
        )

    return {
        "modules": modules,
        "finance_accounts": finance_accounts,
        "chart_accounts": chart_accounts,
        "posting_profiles": posting_profile_rows,
        "summary": {
            "module_count": len(modules),
            "ready_count": sum(1 for row in modules if row["status"] == "READY"),
            "blocked_count": sum(1 for row in modules if row["status"] == "BLOCKED"),
            "partial_count": sum(1 for row in modules if row["status"] == "PARTIAL"),
            "deferred_count": sum(1 for row in modules if row["status"] == "DEFERRED"),
            "selectable_collection_accounts_count": sum(1 for row in finance_accounts if row["is_selectable_collection_account"]),
            "diagnostic_system_accounts_count": sum(1 for row in finance_accounts if row["is_system_or_control"]),
        },
    }
