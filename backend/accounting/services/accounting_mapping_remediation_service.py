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
    DocumentSequence,
    JournalEntry,
)
from accounting.services.accounting_setup_catalog import CANONICAL_CHART_ACCOUNT_BY_KEY
from accounting.services.returns_damage_credit_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_returns_damage_credit,
)
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults

COA_HREF = "/admin/accounting/chart-of-accounts"
SETUP_HREF = "/admin/accounting/setup"
FINANCE_ACCOUNT_HREF = "/admin/settings/business-setup/finance-accounts"
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

# Aliases shown by existing bridge/reconciliation rows. These are setup-safe events;
# the action seeds accounts/mappings only and never posts journals.
EVENT_ACTION_OVERRIDES: dict[str, dict[str, Any]] = {
    "commission_accrual": {"label": "Commission accrual", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
    "commission_approval": {"label": "Commission approval", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
    "commission_payout": {"label": "Commission payout", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
    "payout_batch_payment": {"label": "Payout batch payment", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
    "inventory_purchase_receive": {"label": "Inventory purchase receive", "module": "inventory", "action_href": FINANCE_ACCOUNT_HREF},
    "purchase_inventory_receive": {"label": "Purchase inventory receive", "module": "inventory", "action_href": FINANCE_ACCOUNT_HREF},
    "rent_lease_monthly_collection": {"label": "Rent / lease monthly collection", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
    "security_deposit_collection": {"label": "Security deposit collection", "module": "subscriptions", "action_href": FINANCE_ACCOUNT_HREF},
}

UNSUPPORTED_EVENTS = {
    "staff_advance": "StaffAdvance workflow is not enabled. Configure only after a real StaffAdvance source model exists.",
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


def _readiness_events_by_key() -> dict[str, dict[str, Any]]:
    payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    events = {str(row.get("event_key") or "").strip().lower(): row for row in payload.get("events") or []}
    if "inventory_purchase_receive" in events and "purchase_inventory_receive" not in events:
        events["purchase_inventory_receive"] = {**events["inventory_purchase_receive"], "event_key": "purchase_inventory_receive", "label": "Purchase inventory receive"}
    if "commission_payout" in events and "payout_batch_payment" not in events:
        events["payout_batch_payment"] = {**events["commission_payout"], "event_key": "payout_batch_payment", "label": "Payout batch payment"}
    if "commission_accrual" in events and "commission_approval" not in events:
        events["commission_approval"] = {**events["commission_accrual"], "event_key": "commission_approval", "label": "Commission approval"}
    return events


def _event_reason(event_type: str) -> str:
    row = _readiness_events_by_key().get((event_type or "").strip().lower())
    if not row:
        return "Review accounting setup."
    reasons = row.get("blocking_reasons") or []
    return reasons[0] if reasons else row.get("operator_action") or "Review accounting setup."


def _special_row(spec: RemediationSpec) -> dict[str, Any]:
    supported = _source_model_exists(spec)
    account = _existing_account(spec)
    mapping = _existing_mapping(spec)
    if spec.event_type == "staff_advance" and not supported:
        status = "UNSUPPORTED_SOURCE"
        reason = UNSUPPORTED_EVENTS["staff_advance"]
        recommended = "Unsupported source model; hidden from posting until workflow exists."
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
            action_label = "Apply mapping"
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
        "setup_route": spec.action_href,
        "can_auto_create_account": can_auto_create,
        "can_apply_mapping": can_map,
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


def _generic_row(event_key: str, event: dict[str, Any]) -> dict[str, Any]:
    status = str(event.get("status") or "NOT_CONFIGURED").strip().upper()
    ready = status == "READY"
    override = EVENT_ACTION_OVERRIDES.get(event_key, {})
    source_model = event.get("source_model") or override.get("source_model") or "—"
    if event_key in UNSUPPORTED_EVENTS:
        return {
            "event_type": event_key,
            "event_key": event_key,
            "source_model": source_model,
            "module": override.get("module") or event.get("source_module") or "accounting",
            "status": "UNSUPPORTED_SOURCE",
            "reason": UNSUPPORTED_EVENTS[event_key],
            "recommended_action": "Unsupported source model; hidden from posting until workflow exists.",
            "action_type": "unsupported_source",
            "action_label": "Unsupported Source",
            "action_href": SETUP_HREF,
            "setup_route": SETUP_HREF,
            "can_auto_create_account": False,
            "can_apply_mapping": False,
            "can_map_account": False,
            "can_post": False,
            "is_supported": False,
            "is_acknowledgeable": False,
            "required_account_type": None,
            "required_account_code": None,
            "required_account_name": None,
            "required_account_system_code": None,
            "existing_account_id": None,
            "mapping_id": None,
        }
    return {
        "event_type": event_key,
        "event_key": event_key,
        "source_model": source_model,
        "module": override.get("module") or event.get("source_module") or "accounting",
        "status": "READY" if ready else "BLOCKED_BY_MAPPING",
        "reason": (event.get("blocking_reasons") or [event.get("operator_action") or "Review accounting setup."])[0],
        "recommended_action": "Mapping is ready. Review bridge reconciliation before controlled posting." if ready else "Seed supported defaults or open finance account setup to complete missing accounts/mappings.",
        "action_type": "review_bridge" if ready else "seed_supported_defaults",
        "action_label": "Review bridge items" if ready else "Seed Supported Mappings",
        "action_href": override.get("action_href") or FINANCE_ACCOUNT_HREF,
        "setup_route": override.get("action_href") or FINANCE_ACCOUNT_HREF,
        "can_auto_create_account": not ready,
        "can_apply_mapping": not ready,
        "can_map_account": not ready,
        "can_post": False,
        "is_supported": True,
        "is_acknowledgeable": False,
        "required_account_type": None,
        "required_account_code": None,
        "required_account_name": None,
        "required_account_system_code": None,
        "existing_account_id": None,
        "mapping_id": None,
    }


def build_mapping_remediation_summary() -> dict[str, Any]:
    events = _readiness_events_by_key()
    rows_by_key: dict[str, dict[str, Any]] = {}
    for spec in REMEDIATION_SPECS.values():
        rows_by_key[spec.event_type] = _special_row(spec)
    for key, event in events.items():
        if key not in rows_by_key:
            rows_by_key[key] = _generic_row(key, event)
    for key, override in EVENT_ACTION_OVERRIDES.items():
        if key not in rows_by_key:
            rows_by_key[key] = _generic_row(key, {"event_key": key, "label": override.get("label"), "source_module": override.get("module"), "status": "NOT_CONFIGURED", "blocking_reasons": ["Mapping readiness is not configured for this event."]})
    rows = sorted(rows_by_key.values(), key=lambda item: (str(item.get("module") or ""), str(item.get("event_key") or "")))
    return {
        "generated_at": timezone.now().isoformat(),
        "read_only": True,
        "journal_entries_created": 0,
        "document_sequences_allocated": 0,
        "rows": rows,
        "results": rows,
        "actions": {
            "seed_supported_defaults": "/api/v1/admin/accounting/mapping-remediation/seed-supported-defaults/",
            "create_account": "/api/v1/admin/accounting/mapping-remediation/create-account/",
            "apply_mapping": "/api/v1/admin/accounting/mapping-remediation/apply/",
            "open_setup": FINANCE_ACCOUNT_HREF,
        },
        "summary": {
            "total": len(rows),
            "ready": sum(1 for row in rows if row["status"] == "READY"),
            "missing_account": sum(1 for row in rows if row["status"] == "MISSING_ACCOUNT"),
            "unmapped": sum(1 for row in rows if row["status"] == "ACCOUNT_EXISTS_UNMAPPED"),
            "blocked": sum(1 for row in rows if row["status"] in {"BLOCKED_BY_MAPPING", "MISSING_ACCOUNT", "ACCOUNT_EXISTS_UNMAPPED"}),
            "unsupported": sum(1 for row in rows if row["status"] == "UNSUPPORTED_SOURCE"),
        },
    }


@transaction.atomic
def create_missing_mapped_account(*, event_type: str, actor=None) -> dict[str, Any]:
    key = (event_type or "").strip().lower()
    spec = REMEDIATION_SPECS.get(key)
    if spec is None:
        # Supported general events are safest through the default seeding action because they may need multiple accounts.
        return seed_supported_defaults(actor=actor, selected_event=key)
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
        return seed_supported_defaults(actor=actor, selected_event=key)
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


@transaction.atomic
def seed_supported_defaults(*, actor=None, selected_event: str | None = None) -> dict[str, Any]:
    journal_before = JournalEntry.objects.count()
    sequence_before = DocumentSequence.objects.count()
    # General accounting defaults cover collection, commission, payout, purchase, inventory, rent/lease, and system posting mappings.
    defaults_payload = apply_accounting_setup_defaults(performed_by=actor)
    special_results = []
    for key in ("inventory_delivery_out", "manufacturing_wastage"):
        try:
            special_results.append(create_missing_mapped_account(event_type=key, actor=actor))
            special_results.append(apply_mapping(event_type=key, actor=actor))
        except ValueError as exc:
            special_results.append({"event_type": key, "blocked": True, "detail": str(exc)})
    return {
        "selected_event": selected_event,
        "defaults": defaults_payload,
        "special_results": special_results,
        "journal_entries_created": JournalEntry.objects.count() - journal_before,
        "document_sequences_allocated": DocumentSequence.objects.count() - sequence_before,
        "readiness": build_mapping_remediation_summary(),
    }


def acknowledge_warning(*, event_type: str, actor=None) -> dict[str, Any]:
    key = (event_type or "").strip().lower()
    if key == "staff_advance":
        return {"acknowledged": False, "event_type": key, "detail": "StaffAdvance workflow is unsupported and cannot be acknowledged as postable.", "readiness": build_mapping_remediation_summary()}
    return {"acknowledged": False, "event_type": key, "detail": "Mapping blockers are not acknowledgeable. Complete mapping instead.", "readiness": build_mapping_remediation_summary()}
