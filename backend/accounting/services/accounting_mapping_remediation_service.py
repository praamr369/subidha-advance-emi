from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    JournalEntry,
)
from accounting.services.returns_damage_credit_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_returns_damage_credit,
)

COA_HREF = "/admin/accounting/chart-of-accounts"
SETUP_HREF = "/admin/accounting/setup"
MAPPING_HREF = "/admin/accounting/setup"
BRIDGE_HREF = "/admin/accounting/bridge-reconciliation"


@dataclass(frozen=True)
class RemediationSpec:
    event_type: str
    source_app: str
    source_model: str
    module: str
    required_account_type: str
    required_account_code: str
    required_account_system_code: str
    required_account_name: str
    profile_key: str
    action_label: str
    action_href: str
    recommended_action: str


REMEDIATION_SPECS: dict[str, RemediationSpec] = {
    "inventory_delivery_out": RemediationSpec(
        event_type="inventory_delivery_out",
        source_app="inventory",
        source_model="StockLedger",
        module="inventory",
        required_account_type=ChartOfAccountType.EXPENSE,
        required_account_code="COGS_EXPENSE",
        required_account_system_code="COGS",
        required_account_name="Cost of Goods Sold / Delivery Out Expense",
        profile_key="COGS",
        action_label="Create COGS Account",
        action_href=COA_HREF,
        recommended_action="Create or map a COGS expense account before delivery-out bridge posting can become ready.",
    ),
    "manufacturing_wastage": RemediationSpec(
        event_type="manufacturing_wastage",
        source_app="manufacturing",
        source_model="ProductionJob",
        module="manufacturing",
        required_account_type=ChartOfAccountType.EXPENSE,
        required_account_code="MANUFACTURING_WASTAGE_EXPENSE",
        required_account_system_code="MANUFACTURING_WASTAGE",
        required_account_name="Manufacturing Wastage / Scrap Expense",
        profile_key="MANUFACTURING_WASTAGE",
        action_label="Create Wastage Expense Account",
        action_href=COA_HREF,
        recommended_action="Create or map a manufacturing wastage expense account before wastage bridge posting can become ready.",
    ),
    "staff_advance": RemediationSpec(
        event_type="staff_advance",
        source_app="accounting",
        source_model="StaffAdvance",
        module="accounting",
        required_account_type=ChartOfAccountType.ASSET,
        required_account_code="STAFF_ADVANCE_ASSET",
        required_account_system_code="STAFF_ADVANCE_ASSET",
        required_account_name="Staff Advance Receivable",
        profile_key="STAFF_ADVANCE_ASSET",
        action_label="Configure Staff Advance Account",
        action_href=SETUP_HREF,
        recommended_action="Enable StaffAdvance workflow before accounting posting.",
    ),
}


def _source_model_exists(spec: RemediationSpec) -> bool:
    try:
        apps.get_model(spec.source_app, spec.source_model, require_ready=False)
    except LookupError:
        return False
    return True


def _existing_account(spec: RemediationSpec) -> ChartOfAccount | None:
    return (
        ChartOfAccount.objects.filter(system_code=spec.required_account_system_code, is_active=True).order_by("id").first()
        or ChartOfAccount.objects.filter(code__iexact=spec.required_account_code, is_active=True).order_by("id").first()
    )


def _existing_mapping(spec: RemediationSpec) -> AccountingPostingProfile | None:
    return AccountingPostingProfile.objects.filter(key=spec.profile_key, is_active=True).select_related("chart_account").order_by("id").first()


def _event_reason(event_type: str) -> str:
    payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    for row in payload.get("events") or []:
        if row.get("event_key") == event_type:
            reasons = row.get("blocking_reasons") or []
            return reasons[0] if reasons else row.get("operator_action") or "Review accounting setup."
    return "Review accounting setup."


def _row(spec: RemediationSpec) -> dict[str, Any]:
    supported = _source_model_exists(spec)
    account = _existing_account(spec)
    mapping = _existing_mapping(spec)
    if spec.event_type == "staff_advance" and not supported:
        status = "UNSUPPORTED_SOURCE"
        reason = "StaffAdvance workflow is not enabled. Configure only after StaffAdvance source model exists."
        recommended = "Enable StaffAdvance workflow before accounting posting."
        action_type = "unsupported_source"
        action_label = "Unsupported Source"
        can_auto_create = False
        can_map = False
        can_post = False
        acknowledgeable = False
    else:
        reason = _event_reason(spec.event_type)
        if account and mapping and mapping.chart_account_id == account.id:
            status = "READY"
            action_type = "review_bridge"
            action_label = "Review bridge items"
            recommended = "Mapping is ready. Review unposted bridge items before controlled posting."
        elif account:
            status = "ACCOUNT_EXISTS_UNMAPPED"
            action_type = "apply_mapping"
            action_label = "Map account"
            recommended = "Map the existing chart account to the accounting posting profile."
        else:
            status = "MISSING_ACCOUNT"
            action_type = "create_account"
            action_label = spec.action_label
            recommended = spec.recommended_action
        can_auto_create = supported and account is None
        can_map = supported and account is not None
        can_post = supported and account is not None and mapping is not None and mapping.chart_account_id == account.id
        acknowledgeable = False
    return {
        "event_type": spec.event_type,
        "event_key": spec.event_type,
        "source_model": spec.source_model,
        "module": spec.module,
        "status": status,
        "reason": reason,
        "recommended_action": recommended,
        "action_type": action_type,
        "action_label": action_label,
        "action_href": spec.action_href,
        "can_auto_create_account": can_auto_create,
        "can_map_account": can_map,
        "can_post": can_post,
        "is_supported": supported,
        "is_acknowledgeable": acknowledgeable,
        "required_account_type": spec.required_account_type,
        "required_account_code": spec.required_account_code,
        "required_account_name": spec.required_account_name,
        "required_account_system_code": spec.required_account_system_code,
        "existing_account_id": getattr(account, "id", None),
        "existing_account_code": getattr(account, "code", None),
        "existing_account_name": getattr(account, "name", None),
        "mapping_id": getattr(mapping, "id", None),
        "mapping_profile_key": spec.profile_key,
        "mapping_chart_account_id": getattr(mapping, "chart_account_id", None),
    }


def build_mapping_remediation_summary() -> dict[str, Any]:
    rows = [_row(spec) for spec in REMEDIATION_SPECS.values()]
    return {
        "generated_at": timezone.now().isoformat(),
        "read_only": True,
        "journal_entries_created": 0,
        "document_sequences_allocated": 0,
        "rows": rows,
        "results": rows,
        "summary": {
            "total": len(rows),
            "ready": sum(1 for row in rows if row["status"] == "READY"),
            "missing_account": sum(1 for row in rows if row["status"] == "MISSING_ACCOUNT"),
            "unmapped": sum(1 for row in rows if row["status"] == "ACCOUNT_EXISTS_UNMAPPED"),
            "unsupported": sum(1 for row in rows if row["status"] == "UNSUPPORTED_SOURCE"),
        },
    }


@transaction.atomic
def create_missing_mapped_account(*, event_type: str, actor=None) -> dict[str, Any]:
    key = (event_type or "").strip().lower()
    spec = REMEDIATION_SPECS.get(key)
    if spec is None:
        raise ValueError("Unsupported remediation event_type.")
    if not _source_model_exists(spec):
        raise ValueError(f"{spec.source_model} workflow is not enabled. Source must exist before creating posting accounts.")
    account = _existing_account(spec)
    created = False
    if account is None:
        account = ChartOfAccount.objects.create(
            code=spec.required_account_code,
            name=spec.required_account_name,
            account_type=spec.required_account_type,
            is_active=True,
            allow_manual_posting=True,
            system_code=spec.required_account_system_code,
            notes="Created by Accounting Mapping Remediation. Does not post journals or mutate source records.",
        )
        created = True
    return {"created": created, "account_id": account.id, "account_code": account.code, "account_name": account.name, "readiness": build_mapping_remediation_summary()}


@transaction.atomic
def apply_mapping(*, event_type: str, account_id: int | None = None, actor=None) -> dict[str, Any]:
    key = (event_type or "").strip().lower()
    spec = REMEDIATION_SPECS.get(key)
    if spec is None:
        raise ValueError("Unsupported remediation event_type.")
    if not _source_model_exists(spec):
        raise ValueError(f"{spec.source_model} workflow is not enabled. Source must exist before mapping can be applied.")
    account = ChartOfAccount.objects.filter(pk=account_id).first() if account_id else _existing_account(spec)
    if account is None:
        raise ValueError("Required chart account does not exist. Create the account first.")
    if account.account_type != spec.required_account_type or not account.is_active:
        raise ValueError(f"Account must be an active {spec.required_account_type} account.")
    mapping = AccountingPostingProfile.objects.filter(key=spec.profile_key).first()
    created = False
    if mapping is None:
        mapping = AccountingPostingProfile.objects.create(
            key=spec.profile_key,
            label=spec.required_account_name,
            chart_account=account,
            is_system_only=True,
            is_active=True,
            description="Created by Accounting Mapping Remediation. Does not post journals.",
        )
        created = True
    else:
        changed = False
        if mapping.chart_account_id != account.id:
            mapping.chart_account = account
            changed = True
        if not mapping.is_active:
            mapping.is_active = True
            changed = True
        if mapping.label != spec.required_account_name:
            mapping.label = spec.required_account_name
            changed = True
        if changed:
            mapping.save(update_fields=["chart_account", "is_active", "label", "updated_at"])
    return {"created": created, "mapping_id": mapping.id, "account_id": account.id, "journal_entry_count": JournalEntry.objects.count(), "readiness": build_mapping_remediation_summary()}


def acknowledge_warning(*, event_type: str, actor=None) -> dict[str, Any]:
    key = (event_type or "").strip().lower()
    if key == "staff_advance":
        return {"acknowledged": False, "event_type": key, "detail": "StaffAdvance workflow is unsupported and cannot be acknowledged as postable.", "readiness": build_mapping_remediation_summary()}
    return {"acknowledged": False, "event_type": key, "detail": "Mapping blockers are not acknowledgeable. Complete mapping instead.", "readiness": build_mapping_remediation_summary()}
