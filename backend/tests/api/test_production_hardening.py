from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from tests.helpers import create_admin_user


class ProductionHardeningTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="hardening_admin", phone="9311000001")
        self.client.force_authenticate(self.admin)

    @override_settings(
        DEBUG=True,
        ALLOWED_HOSTS=["localhost"],
        CELERY_BROKER_URL="",
        DEFAULT_FROM_EMAIL="ops@example.com",
        BACKUP_ROOT="/tmp",
        SESSION_COOKIE_SECURE=True,
        CSRF_COOKIE_SECURE=True,
        CSRF_TRUSTED_ORIGINS=["https://example.com"],
    )
    def test_check_production_readiness_fails_on_unsafe_config(self):
        with self.assertRaises(CommandError):
            call_command("check_production_readiness")

    @override_settings(
        HEALTHCHECK_CHECK_MIGRATIONS=False,
        CELERY_BROKER_URL="",
    )
    def test_api_health_endpoints_work(self):
        basic = self.client.get("/api/v1/health/")
        self.assertEqual(basic.status_code, status.HTTP_200_OK)
        self.assertEqual(basic.data["status"], "ok")

        deep = self.client.get("/api/v1/health/deep/")
        self.assertIn(deep.status_code, {status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE})
        self.assertIn("checks", deep.data)
        self.assertIn("database", deep.data["checks"])
        self.assertIn("cache", deep.data["checks"])

    def test_permission_denial_is_logged(self):
        with patch("api.v1.views.reports_center.security_logger.warning") as mocked_log, patch(
            "api.v1.views.reports_center.user_has_capability", return_value=False
        ):
            response = self.client.get(
                "/api/v1/admin/reports-center/reports/daily-collection/export/",
                {"format": "csv"},
            )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mocked_log.assert_called()

    def test_backup_docs_exist(self):
        root = Path(__file__).resolve().parents[3]
        self.assertTrue((root / "docs" / "backup-restore-runbook.md").exists())
        self.assertTrue((root / "docs" / "incident-response.md").exists())
        self.assertTrue((root / "docs" / "daily-operations.md").exists())

    def test_production_checklist_exists(self):
        root = Path(__file__).resolve().parents[3]
        self.assertTrue((root / "docs" / "production-deployment-checklist.md").exists())

    @override_settings(
        DEBUG=False,
        ALLOWED_HOSTS=["example.com"],
        CELERY_BROKER_URL="",
        BACKUP_ROOT="/tmp",
        SECRET_KEY="safe-secret-key-for-tests",
        SESSION_COOKIE_SECURE=True,
        CSRF_COOKIE_SECURE=True,
        CORS_ALLOWED_ORIGINS=["https://example.com"],
        CSRF_TRUSTED_ORIGINS=["https://example.com"],
        REST_FRAMEWORK={"DEFAULT_THROTTLE_RATES": {"auth_login": "5/min", "forgot_password": "5/min", "reset_password": "5/min", "payment_mutation": "30/min"}},
        OTP_DELIVERY_BACKEND="email",
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST="smtp.example.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="mailer@example.com",
        EMAIL_HOST_PASSWORD="secret",
        EMAIL_USE_TLS=True,
        EMAIL_USE_SSL=False,
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_check_production_readiness_accepts_email_otp_when_email_settings_complete(self):
        with patch("subscriptions.management.commands.check_production_readiness.AccountingSetupService.validate_accounting_setup", return_value={"mappings_complete": True, "missing_required_mappings": [], "warnings": []}), patch("subscriptions.management.commands.check_production_readiness.MigrationExecutor") as mock_executor:
            mock_executor.return_value.migration_plan.return_value = []
            call_command("check_production_readiness")

    @override_settings(
        DEBUG=False,
        ALLOWED_HOSTS=["example.com"],
        CELERY_BROKER_URL="",
        BACKUP_ROOT="/tmp",
        SECRET_KEY="safe-secret-key-for-tests",
        SESSION_COOKIE_SECURE=True,
        CSRF_COOKIE_SECURE=True,
        CORS_ALLOWED_ORIGINS=["https://example.com"],
        CSRF_TRUSTED_ORIGINS=["https://example.com"],
        REST_FRAMEWORK={"DEFAULT_THROTTLE_RATES": {"auth_login": "5/min", "forgot_password": "5/min", "reset_password": "5/min", "payment_mutation": "30/min"}},
        OTP_DELIVERY_BACKEND="email",
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST="smtp.example.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="",
        EMAIL_HOST_PASSWORD="",
        EMAIL_USE_TLS=True,
        EMAIL_USE_SSL=False,
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_check_production_readiness_fails_when_email_otp_selected_but_email_settings_incomplete(self):
        with patch("subscriptions.management.commands.check_production_readiness.AccountingSetupService.validate_accounting_setup", return_value={"mappings_complete": True, "missing_required_mappings": [], "warnings": []}), patch("subscriptions.management.commands.check_production_readiness.MigrationExecutor") as mock_executor:
            mock_executor.return_value.migration_plan.return_value = []
            with self.assertRaises(CommandError):
                call_command("check_production_readiness")

    @override_settings(
        DEBUG=False,
        ALLOWED_HOSTS=["example.com"],
        CELERY_BROKER_URL="",
        BACKUP_ROOT="/tmp",
        SECRET_KEY="safe-secret-key-for-tests",
        SESSION_COOKIE_SECURE=True,
        CSRF_COOKIE_SECURE=True,
        CORS_ALLOWED_ORIGINS=["https://example.com"],
        CSRF_TRUSTED_ORIGINS=["https://example.com"],
        REST_FRAMEWORK={"DEFAULT_THROTTLE_RATES": {"auth_login": "5/min", "forgot_password": "5/min", "reset_password": "5/min", "payment_mutation": "30/min"}},
        OTP_DELIVERY_BACKEND="console",
    )
    def test_check_production_readiness_fails_for_dev_only_otp_backend(self):
        with self.assertRaises(CommandError):
            call_command("check_production_readiness")

    @override_settings(
        DEBUG=False,
        ALLOWED_HOSTS=["example.com"],
        CELERY_BROKER_URL="",
        BACKUP_ROOT="/tmp",
        SECRET_KEY="safe-secret-key-for-tests",
        SESSION_COOKIE_SECURE=True,
        CSRF_COOKIE_SECURE=True,
        CORS_ALLOWED_ORIGINS=["https://example.com"],
        CSRF_TRUSTED_ORIGINS=["https://example.com"],
        REST_FRAMEWORK={"DEFAULT_THROTTLE_RATES": {"auth_login": "5/min", "forgot_password": "5/min", "reset_password": "5/min", "payment_mutation": "30/min"}},
        OTP_DELIVERY_BACKEND="sms",
    )
    def test_check_production_readiness_accepts_sms_backend_policy(self):
        with patch("subscriptions.management.commands.check_production_readiness.AccountingSetupService.validate_accounting_setup", return_value={"mappings_complete": True, "missing_required_mappings": [], "warnings": []}), patch("subscriptions.management.commands.check_production_readiness.MigrationExecutor") as mock_executor:
            mock_executor.return_value.migration_plan.return_value = []
            call_command("check_production_readiness")
