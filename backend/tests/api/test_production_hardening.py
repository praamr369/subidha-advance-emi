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
