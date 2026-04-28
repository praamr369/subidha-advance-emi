from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_partner_user


class AIAssistantPermissionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_admin", phone="919100001101")
        self.partner = create_partner_user(username="ai_partner", phone="919100001102")

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_ai_endpoints_return_503_for_admin_when_disabled(self):
        self.client.force_authenticate(self.admin)

        health_response = self.client.get("/api/v1/admin/ai/health/")
        sources_response = self.client.get("/api/v1/admin/ai/sources/")
        query_response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        for response in [health_response, sources_response, query_response]:
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(response.data["detail"], "AI assistant is disabled")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_blocked_when_enabled(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/ai/health/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_gets_stub_response_when_enabled(self):
        self.client.force_authenticate(self.admin)

        health_response = self.client.get("/api/v1/admin/ai/health/")
        sources_response = self.client.get("/api/v1/admin/ai/sources/")
        query_response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS", "top_k": 6},
            format="json",
        )

        for response in [health_response, sources_response, query_response]:
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(response.data["detail"], "AI assistant not yet active")
