from unittest.mock import patch

from django.db.utils import OperationalError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class HealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_liveness_endpoints_return_ok(self):
        for path in ["/healthz/", "/api/v1/public/health/"]:
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

    @override_settings(HEALTHCHECK_CHECK_MIGRATIONS=False, HEALTHCHECK_INCLUDE_DETAILS=False)
    @patch("api.v1.views.health.connections")
    def test_readiness_returns_503_when_database_check_fails(self, mocked_connections):
        mocked_connections.__getitem__.return_value.ensure_connection.side_effect = OperationalError(
            "db down"
        )

        response = self.client.get("/readyz/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["status"], "not_ready")
        self.assertEqual(response.data["checks"]["database"]["status"], "error")
        self.assertEqual(
            response.data["checks"]["database"]["error"],
            "OperationalError",
        )
