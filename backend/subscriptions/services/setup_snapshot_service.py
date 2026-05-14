from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.serializers import serialize
from django.db import transaction
from django.utils import timezone


SETUP_MODEL_LABELS: tuple[str, ...] = (
    "subscriptions.BusinessProfile",
    "accounting.BusinessTaxProfile",
    "accounting.ChartOfAccount",
    "accounting.FinanceAccount",
    "accounting.FinanceAccountCoaMapping",
    "accounting.AccountingPostingProfile",
    "accounting.RentLeaseAccountingAccountMapping",
    "branch_control.Branch",
    "branch_control.CashCounter",
    "inventory.Warehouse",
    "inventory.StockLocation",
    "subscriptions.ProductCategoryMaster",
    "subscriptions.ProductSubcategoryMaster",
    "subscriptions.ProductUnitOfMeasureMaster",
    "accounting.ProductTaxProfile",
)

EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES: tuple[str, ...] = (
    "subscriptions.Customer",
    "subscriptions.Subscription",
    "subscriptions.Emi",
    "subscriptions.Payment",
    "billing.DirectSale",
    "inventory.PurchaseBill",
    "subscriptions.Commission",
    "subscriptions.CommissionPayout",
    "subscriptions.AuditLog",
    "inventory.StockLedger",
)
SETUP_SNAPSHOT_CONFIRMATION = "RESTORE SETUP SNAPSHOT"


@dataclass(frozen=True)
class SnapshotExportResult:
    payload: dict[str, Any]


def _get_model(label: str):
    app_label, model_name = label.split(".", 1)
    return apps.get_model(app_label, model_name)


def _records_for_model(model) -> list[dict[str, Any]]:
    return json.loads(serialize("json", model.objects.all()))


def export_setup_snapshot() -> SnapshotExportResult:
    sections: dict[str, Any] = {}
    counts: dict[str, int] = {}
    for label in SETUP_MODEL_LABELS:
        try:
            model = _get_model(label)
        except Exception:
            continue
        rows = _records_for_model(model)
        sections[label] = rows
        counts[label] = len(rows)

    return SnapshotExportResult(
        payload={
            "version": 1,
            "kind": "setup_snapshot",
            "sections": sections,
            "counts": counts,
            "excluded_transactional_prefixes": list(EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES),
        }
    )


def preview_import_setup_snapshot(*, payload: dict[str, Any]) -> dict[str, Any]:
    sections = payload.get("sections") or {}
    counts = {label: len(rows or []) for label, rows in sections.items()}
    return {
        "mode": "dry_run",
        "kind": payload.get("kind"),
        "version": payload.get("version"),
        "section_count": len(sections),
        "row_counts": counts,
    }


def _is_local_env() -> bool:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    return bool(settings.DEBUG or env in {"development", "test", "local"})


def _has_transactional_section(labels: list[str]) -> list[str]:
    blocked: list[str] = []
    for label in labels:
        for prefix in EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES:
            if label.startswith(prefix):
                blocked.append(label)
                break
    return blocked


def build_setup_snapshot_restore_preview(*, payload: dict[str, Any], preserve_admin_username: str) -> dict[str, Any]:
    sections = payload.get("sections") or {}
    labels = list(sections.keys())
    row_counts = {label: len(rows or []) for label, rows in sections.items()}
    transactional_hits = _has_transactional_section(labels)
    auth_hits = [label for label in labels if label == "accounts.User" or label.startswith("auth.")]
    missing_required = [label for label in SETUP_MODEL_LABELS if label not in labels]

    User = get_user_model()
    preserved_admin = User.objects.filter(username=preserve_admin_username).values("id", "username", "is_active", "role", "is_superuser").first()

    checklist = [
        {"key": "business_profile", "label": "Business profile included", "status": "PASS" if "subscriptions.BusinessProfile" in labels else "NOT_INCLUDED", "details": "Business setup profile row presence.", "recommended_action": "Include subscriptions.BusinessProfile in snapshot."},
        {"key": "tax_profile", "label": "GST_UNREGISTERED tax profile included", "status": "PASS" if "accounting.BusinessTaxProfile" in labels else "NOT_INCLUDED", "details": "Business tax profile row presence.", "recommended_action": "Include accounting.BusinessTaxProfile in snapshot."},
        {"key": "coa", "label": "Chart of accounts included", "status": "PASS" if "accounting.ChartOfAccount" in labels else "NOT_INCLUDED", "details": "COA section presence.", "recommended_action": "Include accounting.ChartOfAccount in snapshot."},
        {"key": "finance", "label": "Finance accounts included", "status": "PASS" if "accounting.FinanceAccount" in labels else "NOT_INCLUDED", "details": "Finance account section presence.", "recommended_action": "Include accounting.FinanceAccount in snapshot."},
        {"key": "mappings", "label": "Operational mappings included", "status": "PASS" if "accounting.FinanceAccountCoaMapping" in labels else "NOT_INCLUDED", "details": "COA mapping presence.", "recommended_action": "Include accounting.FinanceAccountCoaMapping."},
        {"key": "posting_profiles", "label": "Posting profiles included", "status": "PASS" if "accounting.AccountingPostingProfile" in labels else "NOT_INCLUDED", "details": "Posting profile presence.", "recommended_action": "Include accounting.AccountingPostingProfile."},
        {"key": "branch", "label": "Branch included", "status": "PASS" if "branch_control.Branch" in labels else "NOT_INCLUDED", "details": "Branch setup presence.", "recommended_action": "Include branch_control.Branch."},
        {"key": "counter", "label": "Counter included", "status": "PASS" if "branch_control.CashCounter" in labels else "NOT_INCLUDED", "details": "Counter setup presence.", "recommended_action": "Include branch_control.CashCounter."},
        {"key": "warehouse", "label": "Warehouse / stock location included", "status": "PASS" if "inventory.Warehouse" in labels and "inventory.StockLocation" in labels else "NOT_INCLUDED", "details": "Warehouse and stock location setup.", "recommended_action": "Include both inventory.Warehouse and inventory.StockLocation."},
        {"key": "payment_collection", "label": "Payment collection account included", "status": "PASS" if "accounting.FinanceAccountCoaMapping" in labels else "WARNING", "details": "Collection mapping inferred via COA mappings.", "recommended_action": "Ensure collection purposes exist in mappings."},
        {"key": "product_category", "label": "Product category included", "status": "PASS" if "subscriptions.ProductCategoryMaster" in labels else "NOT_INCLUDED", "details": "Product category master presence.", "recommended_action": "Include subscriptions.ProductCategoryMaster."},
        {"key": "product_tax", "label": "Product tax profile readiness included", "status": "PASS" if "accounting.ProductTaxProfile" in labels else "NOT_INCLUDED", "details": "Product tax profile section.", "recommended_action": "Include accounting.ProductTaxProfile."},
        {"key": "direct_sale_ready", "label": "Direct sale readiness check", "status": "WARNING", "details": "Derived from setup coverage only.", "recommended_action": "Run setup readiness after restore."},
        {"key": "advance_emi_ready", "label": "Advance EMI readiness check", "status": "WARNING", "details": "Derived from setup coverage only.", "recommended_action": "Run setup readiness after restore."},
        {"key": "rent_lease_ready", "label": "Rent/lease readiness check", "status": "WARNING", "details": "Derived from setup coverage only.", "recommended_action": "Run setup readiness after restore."},
        {"key": "purchase_ready", "label": "Purchase readiness check", "status": "WARNING", "details": "Derived from setup coverage only.", "recommended_action": "Run setup readiness after restore."},
        {"key": "transactional_excluded", "label": "Transactional data excluded", "status": "PASS" if not transactional_hits else "BLOCKED", "details": "Snapshot must exclude transactional model sections.", "recommended_action": "Remove transactional sections from package."},
        {"key": "admin_preserved", "label": "Admin account preserved", "status": "PASS" if preserved_admin else "BLOCKED", "details": "Preserved admin username must exist and remain unchanged.", "recommended_action": "Provide a valid preserved admin username."},
        {"key": "production_safety", "label": "Production safety check passed", "status": "PASS" if _is_local_env() else "BLOCKED", "details": "Setup snapshot restore is local/dev/test only by default.", "recommended_action": "Run in local/dev/test or enable explicit safe flag."},
        {"key": "dry_run_completed", "label": "Dry-run preview completed", "status": "PASS", "details": "Preview response generated.", "recommended_action": "Review blockers/warnings before execute."},
        {"key": "typed_confirmation", "label": "Typed confirmation entered", "status": "WARNING", "details": "Execution requires exact phrase.", "recommended_action": f"Type {SETUP_SNAPSHOT_CONFIRMATION} at execute time."},
    ]

    blockers: list[str] = []
    warnings: list[str] = []
    if transactional_hits:
        blockers.append(f"Transactional sections present: {', '.join(sorted(set(transactional_hits)))}")
    if auth_hits:
        blockers.append("Auth/user model sections are not allowed in setup snapshot restore package.")
    if not preserved_admin:
        blockers.append("Preserved admin username is missing or invalid.")
    if not _is_local_env():
        blockers.append("Setup snapshot restore is disabled in this environment.")
    if missing_required:
        warnings.append(f"Missing setup sections: {', '.join(missing_required)}")

    allowed = len(blockers) == 0
    return {
        "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
        "snapshot_version": payload.get("version"),
        "exported_at": payload.get("exported_at"),
        "exported_by": payload.get("exported_by"),
        "source_environment": payload.get("source_environment"),
        "included_sections": labels,
        "excluded_sections": list(EXCLUDED_TRANSACTIONAL_MODEL_PREFIXES),
        "model_counts": payload.get("counts") or {},
        "row_counts": row_counts,
        "blocking_issues": blockers,
        "warnings": warnings,
        "readiness_before": {},
        "readiness_after_estimate": {},
        "preserved_admin": preserved_admin,
        "allowed_to_restore": allowed,
        "required_confirmation_phrase": SETUP_SNAPSHOT_CONFIRMATION,
        "checklist": checklist,
        "generated_at": timezone.now().isoformat(),
    }


def import_setup_snapshot(*, payload: dict[str, Any], dry_run: bool = True) -> dict[str, Any]:
    preview = preview_import_setup_snapshot(payload=payload)
    if dry_run:
        return preview

    sections = payload.get("sections") or {}
    applied: dict[str, int] = {}
    with transaction.atomic():
        for label, rows in sections.items():
            if label not in SETUP_MODEL_LABELS:
                continue
            try:
                model = _get_model(label)
            except Exception:
                continue
            created = 0
            for row in rows or []:
                fields = row.get("fields") or {}
                pk = row.get("pk")
                normalized: dict[str, Any] = {}
                for key, value in fields.items():
                    try:
                        field = model._meta.get_field(key)
                    except Exception:
                        normalized[key] = value
                        continue
                    if getattr(field, "is_relation", False) and not getattr(field, "many_to_many", False):
                        normalized[f"{key}_id"] = value
                    else:
                        normalized[key] = value
                model.objects.update_or_create(id=pk, defaults=normalized)
                created += 1
            applied[label] = created

    return {**preview, "mode": "applied", "applied_row_counts": applied}
