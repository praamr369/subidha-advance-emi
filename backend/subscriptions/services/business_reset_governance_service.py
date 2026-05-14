from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.serializers import serialize
from django.db import connection, transaction
from django.utils import timezone

from subscriptions.models_business_setup import BusinessDataBackupJob, BusinessDataRestoreJob
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog
from subscriptions.services.business_reset_service import RESET_CONFIRMATION
from subscriptions.services.setup_snapshot_service import (
    SETUP_SNAPSHOT_CONFIRMATION,
    build_setup_snapshot_restore_preview,
    import_setup_snapshot,
)


BACKUP_CONFIRMATION = RESET_CONFIRMATION


@dataclass(frozen=True)
class ResetScopeSpec:
    code: str
    label: str
    danger_level: str
    model_labels: tuple[str, ...]
    requires_backup: bool = False


RESET_SCOPE_REGISTRY: tuple[ResetScopeSpec, ...] = (
    ResetScopeSpec("PUBLIC_PROFILE_ONLY", "Public site profile/content", "LOW", ("subscriptions.PublicBusinessProfile",)),
    ResetScopeSpec("BUSINESS_PROFILE_ONLY", "Business profile", "LOW", ("subscriptions.BusinessProfile",)),
    ResetScopeSpec("POLICY_GOVERNANCE_ONLY", "Policy/compliance", "MEDIUM", ("subscriptions.PolicyPage", "subscriptions.BusinessComplianceDocument")),
    ResetScopeSpec("COA_ONLY", "Chart of accounts", "HIGH", ("accounting.ChartOfAccount",)),
    ResetScopeSpec("FINANCE_ACCOUNTS_ONLY", "Finance accounts", "HIGH", ("accounting.FinanceAccount",)),
    ResetScopeSpec("COA_MAPPINGS_ONLY", "COA mappings", "MEDIUM", ("accounting.FinanceAccountCoaMapping", "accounting.AccountingPostingProfile", "accounting.RentLeaseAccountingAccountMapping")),
    ResetScopeSpec("ACCOUNTING_SETUP_ONLY", "Accounting setup", "HIGH", ("accounting.ChartOfAccount", "accounting.FinanceAccount", "accounting.FinanceAccountCoaMapping", "accounting.AccountingPostingProfile", "accounting.AccountingPeriod", "accounting.DocumentSequence", "accounting.TaxProfile")),
    ResetScopeSpec("BRANCH_COUNTER_SETUP_ONLY", "Branch/counter setup", "MEDIUM", ("branch_control.Branch", "accounting.CashCounter")),
    ResetScopeSpec("INVENTORY_SETUP_ONLY", "Inventory setup", "HIGH", ("inventory.StockLocation", "inventory.Warehouse", "inventory.InventoryItem", "inventory.OpeningStockEntry", "inventory.ReorderRule")),
    ResetScopeSpec("PRODUCT_CATALOG_ONLY", "Product catalog", "HIGH", ("subscriptions.ProductCategoryMaster", "subscriptions.ProductSubcategoryMaster", "subscriptions.ProductUnitOfMeasureMaster", "subscriptions.Product")),
    ResetScopeSpec("CUSTOMER_CRM_ONLY", "Customer CRM", "HIGH", ("subscriptions.Customer", "crm.CrmParty", "crm.CrmLead", "crm.CrmInteraction", "subscriptions.CustomerSupportRequest")),
    ResetScopeSpec("SALES_DIRECT_ONLY", "Direct sales", "HIGH", ("billing.DirectSale", "billing.SalesInvoice", "billing.SalesReceipt", "billing.CreditNote", "billing.DebitNote")),
    ResetScopeSpec("SUBSCRIPTION_EMI_ONLY", "Subscriptions/EMI", "VERY_HIGH", ("subscriptions.Batch", "subscriptions.LuckyId", "subscriptions.Subscription", "subscriptions.Emi", "subscriptions.Payment", "subscriptions.LuckyDraw", "subscriptions.PaymentReconciliation", "subscriptions.Commission", "subscriptions.CommissionPayoutBatch"), True),
    ResetScopeSpec("RENT_LEASE_ONLY", "Rent/lease", "HIGH", ("subscriptions.RentSubscriptionProfile", "subscriptions.LeaseSubscriptionProfile", "subscriptions.RentLeaseDemand", "subscriptions.RentLeaseDepositLedger", "subscriptions.ProductPossession", "subscriptions.RentLeaseReturnInspection")),
    ResetScopeSpec("AUTH_ARTIFACTS_ONLY", "Auth artifacts", "MEDIUM", ("sessions.Session", "token_blacklist.OutstandingToken", "token_blacklist.BlacklistedToken", "accounts.PasswordResetRequest")),
    ResetScopeSpec("FULL_BUSINESS_DATA_EXCEPT_PRESERVED_ADMIN", "Full business reset except preserved admin", "VERY_HIGH", (), True),
)


def _backup_root() -> Path:
    root = Path(getattr(settings, "PRIVATE_BACKUP_ROOT", Path(settings.BASE_DIR) / "private_backups"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def list_reset_scopes() -> list[dict[str, Any]]:
    return [
        {
            "code": scope.code,
            "label": scope.label,
            "danger_level": scope.danger_level,
            "requires_backup": scope.requires_backup,
            "model_labels": list(scope.model_labels),
        }
        for scope in RESET_SCOPE_REGISTRY
    ]


def _resolve_existing_models(model_labels: tuple[str, ...]) -> list[type]:
    resolved: list[type] = []
    for label in model_labels:
        try:
            app_label, model_name = label.split(".", 1)
            model = apps.get_model(app_label, model_name)
        except Exception:
            continue
        if model is not None:
            resolved.append(model)
    return resolved


def _has_posted_financial_history() -> bool:
    for label in ("accounting.JournalEntry", "subscriptions.Payment", "subscriptions.FinancialLedger"):
        try:
            app_label, model_name = label.split(".", 1)
            model = apps.get_model(app_label, model_name)
            if model.objects.exists():
                return True
        except Exception:
            continue
    return False


def _has_inventory_history() -> bool:
    for label in ("inventory.StockLedger", "billing.DirectSale", "inventory.PurchaseBill"):
        try:
            app_label, model_name = label.split(".", 1)
            model = apps.get_model(app_label, model_name)
            if model.objects.exists():
                return True
        except Exception:
            continue
    return False


def _has_product_references() -> bool:
    for label in ("subscriptions.Subscription", "billing.DirectSale", "inventory.StockLedger"):
        try:
            app_label, model_name = label.split(".", 1)
            model = apps.get_model(app_label, model_name)
            if model.objects.exists():
                return True
        except Exception:
            continue
    return False


def _scope_by_code(code: str) -> ResetScopeSpec:
    for item in RESET_SCOPE_REGISTRY:
        if item.code == code:
            return item
    raise ValueError(f"Unsupported reset scope: {code}")


def build_reset_preview(*, scopes: list[str], preserve_username: str, preserve_user_ids: list[int] | None = None) -> dict[str, Any]:
    preserve_user_ids = preserve_user_ids or []
    blockers: list[str] = []
    warnings: list[str] = []
    total_rows = 0
    models_payload: list[dict[str, Any]] = []

    selected = [_scope_by_code(code) for code in scopes]
    for scope in selected:
        if scope.code in {"COA_ONLY", "FINANCE_ACCOUNTS_ONLY", "ACCOUNTING_SETUP_ONLY"} and _has_posted_financial_history():
            blockers.append(f"{scope.code}: posted financial history exists; setup-only reset is blocked.")
        if scope.code == "INVENTORY_SETUP_ONLY" and _has_inventory_history():
            blockers.append("INVENTORY_SETUP_ONLY: stock/sales/purchase history exists.")
        if scope.code == "PRODUCT_CATALOG_ONLY" and _has_product_references():
            blockers.append("PRODUCT_CATALOG_ONLY: product references exist in subscriptions/direct-sales/inventory.")

        for model in _resolve_existing_models(scope.model_labels):
            count = model.objects.count()
            total_rows += count
            models_payload.append({
                "scope": scope.code,
                "label": model._meta.label,
                "db_table": model._meta.db_table,
                "count": count,
            })

    full_reset = any(s.code == "FULL_BUSINESS_DATA_EXCEPT_PRESERVED_ADMIN" for s in selected)
    if full_reset:
        warnings.append("Full business reset is destructive and requires a completed backup job.")

    User = get_user_model()
    preserved_users = list(
        User.objects.filter(username=preserve_username).values("id", "username", "is_active", "is_superuser", "role")
    )
    if preserve_user_ids:
        preserved_users.extend(
            list(User.objects.filter(id__in=preserve_user_ids).exclude(username=preserve_username).values("id", "username", "is_active", "is_superuser", "role"))
        )

    if not preserved_users:
        blockers.append("Preserved admin user does not exist.")
    else:
        admin_ok = any((row.get("is_superuser") or row.get("role") == "ADMIN") and row.get("is_active") for row in preserved_users)
        if not admin_ok:
            blockers.append("Preserved admin must be active and ADMIN/superuser.")

    required_confirmation = RESET_CONFIRMATION
    if any(s.danger_level in {"HIGH", "VERY_HIGH"} for s in selected):
        warnings.append("Selected scope includes dangerous reset operation.")

    return {
        "scopes": scopes,
        "selected_scope_count": len(selected),
        "targets": {
            "model_count": len(models_payload),
            "total_rows": total_rows,
            "models": models_payload,
        },
        "warnings": warnings,
        "blockers": blockers,
        "allowed": len(blockers) == 0,
        "required_confirmation_phrase": required_confirmation,
        "preserved_users": preserved_users,
    }


def _truncate_models(models: list[type]) -> None:
    if not models:
        return
    with connection.cursor() as cursor:
        quoted = [connection.ops.quote_name(model._meta.db_table) for model in models]
        if connection.vendor == "postgresql":
            cursor.execute(f"TRUNCATE TABLE {', '.join(quoted)} RESTART IDENTITY CASCADE;")
        else:
            for table in quoted:
                cursor.execute(f"DELETE FROM {table};")


def execute_modular_reset(*, scopes: list[str], preserve_username: str, confirmation_phrase: str, performed_by, backup_job_id: int | None = None) -> dict[str, Any]:
    preview = build_reset_preview(scopes=scopes, preserve_username=preserve_username)
    if not preview["allowed"]:
        raise ValueError("Reset is blocked. Resolve blockers from preview before execution.")
    if (confirmation_phrase or "").strip() != RESET_CONFIRMATION:
        raise ValueError(f"Reset blocked. Provide confirmation_phrase={RESET_CONFIRMATION}.")

    if "FULL_BUSINESS_DATA_EXCEPT_PRESERVED_ADMIN" in scopes:
        if not backup_job_id:
            raise ValueError("Full reset requires backup_job_id.")
        job = BusinessDataBackupJob.objects.filter(id=backup_job_id).first()
        if not job or job.status != BusinessDataBackupJob.Status.COMPLETED:
            raise ValueError("backup_job_id must reference a completed backup job.")

    User = get_user_model()
    preserved_user_ids = set(User.objects.filter(username=preserve_username).values_list("id", flat=True))
    if not preserved_user_ids:
        raise ValueError("Preserved admin not found.")

    selected = [_scope_by_code(code) for code in scopes]
    target_models: list[type] = []
    for scope in selected:
        if scope.code == "FULL_BUSINESS_DATA_EXCEPT_PRESERVED_ADMIN":
            # fallback to existing broad app approach through model scan
            for model in apps.get_models():
                if model._meta.label == "accounts.User":
                    continue
                if model._meta.app_label in {"accounting", "accounts", "billing", "branch_control", "crm", "inventory", "manufacturing", "reminders", "service_desk", "subscriptions"}:
                    target_models.append(model)
            continue
        target_models.extend(_resolve_existing_models(scope.model_labels))

    seen = set()
    unique_models = []
    for model in target_models:
        if model._meta.label in seen:
            continue
        seen.add(model._meta.label)
        unique_models.append(model)

    with transaction.atomic():
        _truncate_models(unique_models)
        User.objects.exclude(id__in=preserved_user_ids).delete()
        User.objects.filter(id__in=preserved_user_ids).update(is_active=True, is_staff=True)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=performed_by,
            performed_by=performed_by,
            metadata={
                "event": "MODULAR_BUSINESS_RESET_EXECUTED",
                "scopes": scopes,
                "preserve_username": preserve_username,
                "backup_job_id": backup_job_id,
            },
        )

    return {"mode": "executed", "preview": preview, "deleted_model_count": len(unique_models)}


def create_backup_job(*, requested_by, scopes: list[str], job_type: str) -> BusinessDataBackupJob:
    preview = build_reset_preview(scopes=scopes, preserve_username=requested_by.username)
    backup_dir = _backup_root()
    now = timezone.now()
    filename = f"backup-{now.strftime('%Y%m%d%H%M%S')}-{requested_by.id}.json"
    path = backup_dir / filename

    payload: dict[str, Any] = {
        "version": 1,
        "job_type": job_type,
        "created_at": now.isoformat(),
        "created_by": requested_by.username,
        "scopes": scopes,
        "preview": preview,
        "sections": {},
    }

    if job_type == BusinessDataBackupJob.JobType.SELECTED_SCOPES_EXPORT:
        for code in scopes:
            scope = _scope_by_code(code)
            rows = []
            for model in _resolve_existing_models(scope.model_labels):
                rows.append({
                    "model": model._meta.label_lower,
                    "records": json.loads(serialize("json", model.objects.all())),
                })
            payload["sections"][code] = rows

    path.write_text(json.dumps(payload), encoding="utf-8")
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()

    job = BusinessDataBackupJob.objects.create(
        job_type=job_type,
        status=BusinessDataBackupJob.Status.COMPLETED,
        requested_by=requested_by,
        scopes=scopes,
        file_path=str(path),
        checksum=checksum,
        row_counts=preview.get("targets", {}),
        metadata={"mode": "app-level-export"},
        completed_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=7),
    )

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=requested_by,
        performed_by=requested_by,
        metadata={"event": "BUSINESS_BACKUP_CREATED", "backup_job_id": job.id, "scopes": scopes, "job_type": job_type},
    )
    return job


def list_backup_jobs(limit: int = 50) -> list[BusinessDataBackupJob]:
    return list(BusinessDataBackupJob.objects.select_related("requested_by").order_by("-created_at")[:limit])


def create_restore_preview(*, requested_by, backup_job: BusinessDataBackupJob, scopes: list[str]) -> BusinessDataRestoreJob:
    path = Path(backup_job.file_path)
    if not path.exists():
        raise ValueError("Backup file is not available.")
    current_checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    if current_checksum != backup_job.checksum:
        raise ValueError("Backup checksum mismatch.")

    payload = json.loads(path.read_text(encoding="utf-8"))
    selected = scopes or list(payload.get("sections", {}).keys())
    rows = 0
    for code in selected:
        for model_section in payload.get("sections", {}).get(code, []):
            rows += len(model_section.get("records", []))

    preview = {
        "selected_scopes": selected,
        "estimated_rows": rows,
        "warnings": ["Restore execution requires confirmation and runs through backend service layer only."],
        "blockers": [],
        "allowed": True,
    }

    job = BusinessDataRestoreJob.objects.create(
        status=BusinessDataRestoreJob.Status.PREVIEWED,
        requested_by=requested_by,
        backup_job=backup_job,
        selected_scopes=selected,
        package_type=backup_job.job_type,
        package_checksum=current_checksum,
        preview=preview,
    )
    return job


def create_setup_snapshot_restore_preview(*, requested_by, snapshot_payload: dict[str, Any], preserve_admin_username: str) -> BusinessDataRestoreJob:
    preview = build_setup_snapshot_restore_preview(
        payload=snapshot_payload,
        preserve_admin_username=preserve_admin_username,
    )
    backup_dir = _backup_root()
    now = timezone.now()
    filename = f"setup-snapshot-{now.strftime('%Y%m%d%H%M%S')}-{requested_by.id}.json"
    path = backup_dir / filename
    path.write_text(json.dumps(snapshot_payload), encoding="utf-8")
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    backup_job = BusinessDataBackupJob.objects.create(
        job_type=BusinessDataBackupJob.JobType.SELECTED_SCOPES_EXPORT,
        status=BusinessDataBackupJob.Status.COMPLETED,
        requested_by=requested_by,
        scopes=["SETUP_SNAPSHOT"],
        file_path=str(path),
        checksum=checksum,
        row_counts=preview.get("row_counts") or {},
        metadata={
            "restore_type": "SETUP_SNAPSHOT_RESTORE_PREVIEW",
            "preserve_admin_username": preserve_admin_username,
        },
        completed_at=timezone.now(),
        expires_at=timezone.now() + timedelta(days=7),
    )
    return BusinessDataRestoreJob.objects.create(
        status=BusinessDataRestoreJob.Status.PREVIEWED,
        requested_by=requested_by,
        backup_job=backup_job,
        selected_scopes=["SETUP_SNAPSHOT"],
        package_type="SETUP_SNAPSHOT",
        package_checksum=checksum,
        preview=preview,
    )


def execute_restore(*, restore_job: BusinessDataRestoreJob, confirmation_phrase: str, requested_by) -> BusinessDataRestoreJob:
    if restore_job.status != BusinessDataRestoreJob.Status.PREVIEWED:
        raise ValueError("Restore preview is required before execute.")

    path = Path(restore_job.backup_job.file_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    restore_type = (restore_job.backup_job.metadata or {}).get("restore_type", "")

    if restore_type == "SETUP_SNAPSHOT_RESTORE_PREVIEW":
        if (confirmation_phrase or "").strip() != SETUP_SNAPSHOT_CONFIRMATION:
            raise ValueError(f"Restore blocked. Provide confirmation_phrase={SETUP_SNAPSHOT_CONFIRMATION}.")
        if not restore_job.preview.get("allowed_to_restore"):
            raise ValueError("Setup snapshot restore is blocked by preview checklist.")
    else:
        if (confirmation_phrase or "").strip() != RESET_CONFIRMATION:
            raise ValueError(f"Restore blocked. Provide confirmation_phrase={RESET_CONFIRMATION}.")

    if restore_job.backup_job.job_type == BusinessDataBackupJob.JobType.FULL_DATABASE_LOGICAL:
        raise ValueError("Raw/full database restore is not supported from web UI. Use CLI runbook.")

    with transaction.atomic():
        if restore_type == "SETUP_SNAPSHOT_RESTORE_PREVIEW":
            import_setup_snapshot(payload=payload, dry_run=False)
        else:
            for code in restore_job.selected_scopes:
                for model_section in payload.get("sections", {}).get(code, []):
                    model_label = model_section.get("model")
                    app_label, model_name = model_label.split(".", 1)
                    model = apps.get_model(app_label, model_name)
                    for record in model_section.get("records", []):
                        fields = record.get("fields") or {}
                        pk = record.get("pk")
                        if model._meta.label == "accounts.User":
                            continue
                        model.objects.update_or_create(pk=pk, defaults=fields)

        restore_job.status = BusinessDataRestoreJob.Status.COMPLETED
        restore_job.completed_at = timezone.now()
        restore_job.approved_by = requested_by
        restore_job.save(update_fields=["status", "completed_at", "approved_by", "updated_at"])

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=requested_by,
            performed_by=requested_by,
            metadata={"event": "BUSINESS_RESTORE_EXECUTED", "restore_job_id": restore_job.id},
        )

    return restore_job
