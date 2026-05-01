from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.executor import MigrationExecutor

from accounts.capabilities import ROLE_CAPABILITY_FALLBACKS
from accounting.services.accounting_setup_service import AccountingSetupService
from subscriptions.models import AuditLog


class Command(BaseCommand):
    help = "Validate production readiness controls before release."

    def handle(self, *args, **options):
        failures: list[str] = []
        warnings: list[str] = []

        if settings.DEBUG:
            failures.append("DEBUG must be False.")

        if not getattr(settings, "ALLOWED_HOSTS", None):
            failures.append("ALLOWED_HOSTS must be configured.")

        db_conf = settings.DATABASES.get(DEFAULT_DB_ALIAS, {})
        if not db_conf.get("ENGINE") or not db_conf.get("NAME"):
            failures.append("Database configuration is incomplete.")

        broker = (getattr(settings, "CELERY_BROKER_URL", "") or "").strip()
        jobs_enabled = bool(broker)
        if jobs_enabled and "redis://" not in broker:
            failures.append("CELERY_BROKER_URL must use redis:// when background jobs are enabled.")

        default_from_email = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
        if not default_from_email:
            failures.append("DEFAULT_FROM_EMAIL must be configured.")

        otp_backend = (getattr(settings, "OTP_DELIVERY_BACKEND", "") or "").strip().lower()
        if otp_backend in {"", "console", "auto"}:
            warnings.append("OTP delivery backend is not explicitly set to sms/email for production.")

        backup_root = Path((getattr(settings, "BACKUP_ROOT", "") or "").strip())
        if not str(backup_root):
            failures.append("BACKUP_ROOT must be configured.")
        elif not backup_root.exists():
            failures.append(f"BACKUP_ROOT does not exist: {backup_root}")
        elif not backup_root.is_dir():
            failures.append(f"BACKUP_ROOT must be a directory: {backup_root}")

        if str(getattr(settings, "SECRET_KEY", "")).strip().lower() in {
            "",
            "change-me",
            "local-development-only-secret-key",
            "unsafe-dev-key",
            "your-real-secret-key",
        }:
            failures.append("SECRET_KEY must not use a default placeholder value.")

        if not getattr(settings, "SESSION_COOKIE_SECURE", False):
            failures.append("SESSION_COOKIE_SECURE must be enabled.")
        if not getattr(settings, "CSRF_COOKIE_SECURE", False):
            failures.append("CSRF_COOKIE_SECURE must be enabled.")

        cors_origins = getattr(settings, "CORS_ALLOWED_ORIGINS", []) or []
        if "*" in cors_origins:
            failures.append("CORS_ALLOWED_ORIGINS must not contain wildcard '*'.")

        csrf_origins = getattr(settings, "CSRF_TRUSTED_ORIGINS", []) or []
        if not csrf_origins:
            warnings.append("CSRF_TRUSTED_ORIGINS is empty; ensure proxy/domain topology is intentional.")

        throttle_rates = (getattr(settings, "REST_FRAMEWORK", {}) or {}).get("DEFAULT_THROTTLE_RATES", {}) or {}
        for scope in ("auth_login", "forgot_password", "reset_password", "payment_mutation"):
            if scope not in throttle_rates:
                failures.append(f"Throttle scope '{scope}' is missing from REST_FRAMEWORK.DEFAULT_THROTTLE_RATES.")

        admin_caps = ROLE_CAPABILITY_FALLBACKS.get("ADMIN", set())
        if "billing.override_allocation" not in admin_caps:
            warnings.append("ADMIN capability fallback does not explicitly include billing.override_allocation.")

        required_audit_types = (
            "PASSWORD_RESET_REQUESTED",
            "PASSWORD_RESET_COMPLETED",
            "PAYMENT_RECONCILED",
        )
        for audit_type in required_audit_types:
            if not hasattr(AuditLog.ActionType, audit_type):
                warnings.append(f"Audit action type missing: {audit_type}")

        User = get_user_model()
        has_admin = User.objects.filter(role="ADMIN", is_active=True).exists() or User.objects.filter(
            is_superuser=True, is_active=True
        ).exists()
        if not has_admin:
            failures.append("At least one active admin/superuser account must exist.")

        setup_payload = AccountingSetupService.validate_accounting_setup()
        if not bool(setup_payload.get("mappings_complete")):
            failures.append("Finance account mappings are incomplete.")

        try:
            executor = MigrationExecutor(connections[DEFAULT_DB_ALIAS])
            targets = executor.loader.graph.leaf_nodes()
            pending = executor.migration_plan(targets)
        except Exception as exc:
            failures.append(f"Migration state check failed: {exc}")
        else:
            if pending:
                failures.append(f"Pending migrations detected: {len(pending)}")

        self.stdout.write(self.style.NOTICE("Production readiness report"))
        for warning in warnings:
            self.stdout.write(self.style.WARNING(f"- WARNING: {warning}"))
        for failure in failures:
            self.stdout.write(self.style.ERROR(f"- FAIL: {failure}"))

        if failures:
            raise CommandError(f"Production readiness failed with {len(failures)} issue(s).")

        self.stdout.write(self.style.SUCCESS("Production readiness checks passed."))
