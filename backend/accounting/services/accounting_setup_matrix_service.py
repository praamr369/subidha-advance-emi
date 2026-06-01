from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
from accounting.services.finance_account_readiness import (
    chart_account_allowed_for_collection,
    chart_account_is_posting_ready,
    finance_account_readiness,
)


OPERATOR_BLOCKED_COPY = "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account."
SYSTEM_DIAGNOSTIC_COPY = "System posting profile diagnostic only; not a customer collection destination."
LEAF_ASSET_ACTION = "Repair creates or reuses a posting leaf account and remaps this finance account only."
RENT_LEASE_SOURCE_COLLECTION_COPY = (
    "Operational source collection is enabled. Accounting posting bridge remains "
    "audit-deferred until approved."
)
NOT_EXPOSED = "Not exposed"


@dataclass(frozen=True)
class PostingProfileSpec:
    key: str
    label: str
    debit_keys: tuple[str, ...]
    credit_keys: tuple[str, ...]
    implemented: bool = True
    deferred_reason: str | None = None


POSTING_PROFILE_SPECS: tuple[PostingProfileSpec, ...] = (
    PostingProfileSpec(
        key="emi_collection",
        label="EMI Collection",
        debit_keys=("CUSTOMER_RECEIVABLE",),
        credit_keys=(FinanceAccountMappingPurpose.EMI_INCOME, "EMI_COLLECTION_CLEARING"),
    ),
    PostingProfileSpec(
        key="direct_sale_collection",
        label="Direct Sale Collection",
        debit_keys=("CUSTOMER_RECEIVABLE",),
        credit_keys=(FinanceAccountMappingPurpose.DIRECT_SALE_INCOME, "SALES_REVENUE"),
    ),
    PostingProfileSpec(
        key="customer_advance",
        label="Customer Advance",
        debit_keys=("CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"),
        credit_keys=(FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,),
    ),
    PostingProfileSpec(
        key="rent_lease_collection",
        label="Rent / Lease Collection",
        debit_keys=("CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"),
        credit_keys=(FinanceAccountMappingPurpose.RENT_INCOME, FinanceAccountMappingPurpose.LEASE_INCOME),
    ),
    PostingProfileSpec(
        key="security_deposit",
        label="Security Deposit",
        debit_keys=("CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"),
        credit_keys=(FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY,),
    ),
    PostingProfileSpec(
        key="refund_customer_credit",
        label="Refund / Customer Credit",
        debit_keys=("SALES_RETURNS", "CUSTOMER_RECEIVABLE"),
        credit_keys=("CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"),
    ),
    PostingProfileSpec(
        key="commission_payout",
        label="Commission Payout",
        debit_keys=(FinanceAccountMappingPurpose.COMMISSION_EXPENSE,),
        credit_keys=(FinanceAccountMappingPurpose.COMMISSION_PAYABLE, "PARTNER_COMMISSION_PAYABLE"),
    ),
    PostingProfileSpec(
        key="vendor_payment",
        label="Vendor Payment",
        debit_keys=("ACCOUNTS_PAYABLE",),
        credit_keys=("CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"),
    ),
    PostingProfileSpec(
        key="purchase_inventory",
        label="Purchase / Inventory",
        debit_keys=(FinanceAccountMappingPurpose.INVENTORY_ASSET, "INPUT_GST"),
        credit_keys=("ACCOUNTS_PAYABLE",),
    ),
    PostingProfileSpec(
        key="reconciliation_clearing",
        label="Reconciliation Clearing",
        debit_keys=("EMI_COLLECTION_CLEARING", "CUSTOMER_RECEIVABLE"),
        credit_keys=("EMI_COLLECTION_CLEARING", "CUSTOMER_RECEIVABLE"),
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
            {"id": account.parent_id, "code": getattr(account.parent, "code", None), "name": getattr(account.parent, "name", None)}
            if account.parent_id
            else None
        ),
    }


def _finance_account_payload(account: FinanceAccount) -> dict[str, Any]:
    readiness = finance_account_readiness(account)
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "branch": (
            {"id": account.branch_id, "code": getattr(account.branch, "code", None), "name": getattr(account.branch, "name", None)}
            if account.branch_id
            else None
        ),
        "mapped_chart_account": _chart_payload(getattr(account, "chart_account", None)),
        "is_active": account.is_active,
        "is_real_settlement_account": account.is_real_settlement_account,
        "operational_collection_account": readiness.operational_collection_account,
        "system_posting_profile": readiness.system_posting_profile,
        "diagnostic_only": readiness.diagnostic_only,
        "collection_ready": readiness.collection_ready,
        "selectable_for_collection": readiness.selectable_for_collection,
        "is_selectable_collection_account": readiness.selectable_for_collection,
        "collection_blocker_reason": readiness.collection_blocker_reason,
        "recommended_action": readiness.recommended_action or (None if readiness.selectable_for_collection else LEAF_ASSET_ACTION),
        "account_role": "system_posting_profile" if readiness.diagnostic_only else "operational_collection_account",
    }


def _posting_profile_payload(profile: AccountingPostingProfile) -> dict[str, Any]:
    chart = getattr(profile, "chart_account", None)
    ready = bool(profile.is_active and chart and chart.is_active)
    return {
        "id": profile.id,
        "key": profile.key,
        "label": profile.label,
        "description": profile.description,
        "is_active": profile.is_active,
        "is_system_only": profile.is_system_only,
        "diagnostic_only": True,
        "selectable_for_collection": False,
        "collection_ready": False,
        "collection_blocker_reason": SYSTEM_DIAGNOSTIC_COPY,
        "chart_account": _chart_payload(chart),
        "ready": ready,
        "status": "READY" if ready else "BLOCKED",
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


def _lookup_account_key(
    key: str,
    mappings_by_purpose: dict[str, list[FinanceAccountCoaMapping]],
    profiles_by_key: dict[str, AccountingPostingProfile],
) -> dict[str, Any]:
    mapping = next((m for m in mappings_by_purpose.get(key, []) if m.is_active), None)
    if mapping is not None:
        payload = _mapping_payload(mapping)
        return {
            "key": key,
            "label": key.replace("_", " ").title(),
            "kind": "finance_account_mapping",
            "configured_account": payload["chart_account"],
            "ready": payload["ready"],
            "blocker": None if payload["ready"] else "Mapping is inactive or points to an inactive chart account.",
            "recommended_action": None if payload["ready"] else "Review the mapping in Accounting Setup.",
        }
    profile = profiles_by_key.get(key)
    if profile is not None:
        payload = _posting_profile_payload(profile)
        return {
            "key": key,
            "label": profile.label or key.replace("_", " ").title(),
            "kind": "system_posting_profile",
            "configured_account": payload["chart_account"],
            "ready": payload["ready"],
            "blocker": None if payload["ready"] else "System posting profile is inactive or mapped to an inactive chart account.",
            "recommended_action": None if payload["ready"] else "Run Accounting Setup defaults or repair the posting profile mapping.",
        }
    return {
        "key": key,
        "label": key.replace("_", " ").title(),
        "kind": "missing_mapping",
        "configured_account": None,
        "ready": False,
        "blocker": "Required accounting mapping or posting profile is missing.",
        "recommended_action": "Run Accounting Setup defaults or map the required account before marking this workflow ready.",
    }


def _collection_requirement(kind: str, finance_accounts: list[dict[str, Any]]) -> dict[str, Any]:
    accounts = [row for row in finance_accounts if row["kind"] == kind and row["operational_collection_account"]]
    ready = [row for row in accounts if row["selectable_for_collection"]]
    blocked = [row for row in accounts if not row["selectable_for_collection"]]
    return {
        "key": f"{kind.lower()}_collection_account",
        "label": f"{kind} collection account",
        "kind": "operational_collection_account",
        "ready": bool(ready),
        "ready_accounts": ready,
        "blocked_accounts": blocked,
        "blocker": None if ready else f"No posting-ready {kind} collection account is selectable.",
        "recommended_action": None if ready else LEAF_ASSET_ACTION,
    }


def _profile_readiness_item(
    spec: PostingProfileSpec,
    mappings_by_purpose: dict[str, list[FinanceAccountCoaMapping]],
    profiles_by_key: dict[str, AccountingPostingProfile],
) -> dict[str, Any]:
    debit_rows = [_lookup_account_key(key, mappings_by_purpose, profiles_by_key) for key in spec.debit_keys]
    credit_rows = [_lookup_account_key(key, mappings_by_purpose, profiles_by_key) for key in spec.credit_keys]
    blockers = [row["blocker"] for row in [*debit_rows, *credit_rows] if row.get("blocker")]
    recommended_actions: list[str] = []
    for row in [*debit_rows, *credit_rows]:
        action = row.get("recommended_action")
        if action and action not in recommended_actions:
            recommended_actions.append(action)
    if spec.deferred_reason and spec.deferred_reason not in blockers:
        blockers.insert(0, spec.deferred_reason)
    if spec.deferred_reason and spec.deferred_reason not in recommended_actions:
        recommended_actions.insert(0, spec.deferred_reason)

    debit_ready = all(row["ready"] for row in debit_rows) if debit_rows else False
    credit_ready = all(row["ready"] for row in credit_rows) if credit_rows else False
    configured_count = sum(1 for row in [*debit_rows, *credit_rows] if row.get("configured_account"))
    total_count = len(debit_rows) + len(credit_rows)

    if not spec.implemented:
        status = "DEFERRED"
    elif debit_ready and credit_ready:
        status = "READY"
    elif configured_count > 0:
        status = "PARTIAL"
    else:
        status = "BLOCKED"

    return {
        "key": spec.key,
        "label": spec.label,
        "status": status,
        "required_debit_account": [row["key"] for row in debit_rows],
        "required_credit_account": [row["key"] for row in credit_rows],
        "configured_debit_account": [row["configured_account"] for row in debit_rows if row.get("configured_account")],
        "configured_credit_account": [row["configured_account"] for row in credit_rows if row.get("configured_account")],
        "debit_rows": debit_rows,
        "credit_rows": credit_rows,
        "blockers": blockers,
        "recommended_action": recommended_actions[0] if recommended_actions else (RENT_LEASE_SOURCE_COLLECTION_COPY if spec.key in {"rent_lease_collection", "security_deposit"} else None),
        "recommended_actions": recommended_actions,
        "implemented": spec.implemented,
        "configured_count": configured_count,
        "required_count": total_count,
        "operator_note": RENT_LEASE_SOURCE_COLLECTION_COPY if spec.key in {"rent_lease_collection", "security_deposit"} else None,
    }


def _chart_health(chart_accounts: list[dict[str, Any]]) -> dict[str, Any]:
    group_control = [row for row in chart_accounts if row["is_group_control"]]
    posting_leaf = [row for row in chart_accounts if row["is_posting_ready"]]
    inactive = [row for row in chart_accounts if not row["is_active"]]
    non_posting = [row for row in chart_accounts if not row["is_posting_ready"]]
    missing_leaf_assets = [row for row in chart_accounts if row["account_type"] == "ASSET" and not row["is_posting_ready"]]
    return {
        "group_control_accounts": group_control,
        "posting_leaf_accounts": posting_leaf,
        "missing_posting_leaf_accounts": missing_leaf_assets,
        "inactive_or_non_posting_blockers": [*inactive, *non_posting],
        "counts": {
            "group_control_count": len(group_control),
            "posting_leaf_count": len(posting_leaf),
            "missing_posting_leaf_count": len(missing_leaf_assets),
            "inactive_or_non_posting_count": len([*inactive, *non_posting]),
        },
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
        FinanceAccountCoaMapping.objects.select_related(
            "finance_account",
            "finance_account__chart_account",
            "finance_account__branch",
            "chart_account",
            "chart_account__parent",
        )
        .prefetch_related("finance_account__chart_account__children", "chart_account__children")
        .order_by("purpose", "-is_default", "id")
    )
    mappings_by_purpose: dict[str, list[FinanceAccountCoaMapping]] = {}
    for mapping in mappings:
        mappings_by_purpose.setdefault(mapping.purpose, []).append(mapping)

    collection_requirements = [
        _collection_requirement(FinanceAccountKind.CASH, finance_accounts),
        _collection_requirement(FinanceAccountKind.BANK, finance_accounts),
        _collection_requirement(FinanceAccountKind.UPI, finance_accounts),
    ]
    posting_profile_readiness = [
        _profile_readiness_item(spec, mappings_by_purpose, profiles_by_key) for spec in POSTING_PROFILE_SPECS
    ]

    modules = []
    for profile in posting_profile_readiness:
        modules.append(
            {
                "module_key": profile["key"],
                "label": profile["label"],
                "status": profile["status"],
                "workflow_active": profile["implemented"],
                "collection_action_enabled": bool(profile["implemented"] and profile["status"] == "READY"),
                "required_mappings": [*profile["debit_rows"], *profile["credit_rows"]],
                "ready_count": profile["configured_count"],
                "blocked_count": len(profile["blockers"]),
                "blockers": profile["blockers"],
                "recommended_actions": profile["recommended_actions"],
            }
        )

    operational_accounts = [row for row in finance_accounts if row["operational_collection_account"]]
    diagnostic_accounts = [row for row in finance_accounts if row["diagnostic_only"]]
    selectable_accounts = [row for row in operational_accounts if row["selectable_for_collection"]]

    return {
        "modules": modules,
        "finance_accounts": finance_accounts,
        "operational_collection_accounts": operational_accounts,
        "diagnostic_system_accounts": diagnostic_accounts,
        "chart_accounts": chart_accounts,
        "chart_of_accounts_health": _chart_health(chart_accounts),
        "posting_profiles": posting_profile_rows,
        "posting_profile_readiness": posting_profile_readiness,
        "collection_requirements": collection_requirements,
        "operator_copy": {
            "finance_accounts": "Finance Accounts are where money is received or paid.",
            "posting_profiles": "Posting Profiles decide which ledger accounts are debited and credited.",
            "chart_of_accounts": "Chart of Accounts is the ledger structure.",
            "system_profiles": "System posting profiles are diagnostic only and cannot receive customer collections.",
            "blocked_collection": OPERATOR_BLOCKED_COPY,
            "rent_lease_source_collection": RENT_LEASE_SOURCE_COLLECTION_COPY,
        },
        "not_exposed_label": NOT_EXPOSED,
        "summary": {
            "module_count": len(modules),
            "ready_count": sum(1 for row in posting_profile_readiness if row["status"] == "READY"),
            "blocked_count": sum(1 for row in posting_profile_readiness if row["status"] == "BLOCKED"),
            "partial_count": sum(1 for row in posting_profile_readiness if row["status"] == "PARTIAL"),
            "deferred_count": sum(1 for row in posting_profile_readiness if row["status"] == "DEFERRED"),
            "selectable_collection_accounts_count": len(selectable_accounts),
            "operational_collection_accounts_count": len(operational_accounts),
            "diagnostic_system_accounts_count": len(diagnostic_accounts),
        },
    }
