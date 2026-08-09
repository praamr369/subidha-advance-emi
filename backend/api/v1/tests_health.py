from unittest.mock import patch

from django.db.utils import OperationalError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from tests.helpers import suppress_expected_request_logs


class HealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_liveness_endpoints_return_ok(self):
        for path in ["/healthz/", "/api/v1/public/health/", "/api/v1/health/"]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["status"], "ok")

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False)
    def test_readiness_endpoints_return_ready_when_db_is_available(self):
        for path in ["/readyz/", "/api/v1/public/readiness/"]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["status"], "ready")
            self.assertEqual(response.data["checks"]["database"]["status"], "ok")

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False, CELERY_BROKER_URL="")
    def test_deep_health_endpoint_returns_payload(self):
        response = self.client.get("/api/v1/health/deep/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("checks", response.data)
        self.assertIn("database", response.data["checks"])
        self.assertIn("cache", response.data["checks"])

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False, CELERY_BROKER_URL="redis://localhost:6379/0")
    def test_deep_health_degraded_worker_is_still_ready(self):
        # An optional dependency (background worker) being down must NOT flip the
        # readiness probe to 503 — the service can still serve HTTP. It reports
        # 200 with status "degraded" instead.
        response = self.client.get("/api/v1/health/deep/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "degraded")
        self.assertEqual(response.data["checks"]["worker_heartbeat"]["status"], "error")

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False, HEALTHCHECK_INCLUDE_DETAILS=False)
    @patch("api.v1.views.health.connections")
    def test_deep_health_returns_503_when_critical_db_fails(self, mocked_connections):
        mocked_connections.__getitem__.return_value.ensure_connection.side_effect = OperationalError(
            "db down"
        )
        with suppress_expected_request_logs("api.health"):
            response = self.client.get("/api/v1/health/deep/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["status"], "unhealthy")

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False, HEALTHCHECK_INCLUDE_DETAILS=False)
    @patch("api.v1.views.health.connections")
    def test_readiness_returns_503_when_database_check_fails(self, mocked_connections):
        mocked_connections.__getitem__.return_value.ensure_connection.side_effect = OperationalError(
            "db down"
        )

        with suppress_expected_request_logs("api.health"):
            response = self.client.get("/readyz/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["status"], "not_ready")
        self.assertEqual(response.data["checks"]["database"]["status"], "error")
        self.assertEqual(
            response.data["checks"]["database"]["error"],
            "OperationalError",
        )
