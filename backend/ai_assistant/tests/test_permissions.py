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
        readiness_response = self.client.get("/api/v1/admin/ai/readiness/")

        for response in [health_response, sources_response, query_response, readiness_response]:
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(response.data["detail"], "AI assistant is disabled")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_blocked_when_enabled(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/ai/health/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        readiness = self.client.get("/api/v1/admin/ai/readiness/")
        self.assertEqual(readiness.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_gets_no_source_query_response_when_enabled(self):
        self.client.force_authenticate(self.admin)

        health_response = self.client.get("/api/v1/admin/ai/health/")
        sources_response = self.client.get("/api/v1/admin/ai/sources/")
        query_response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS", "top_k": 6},
            format="json",
        )

        self.assertEqual(health_response.status_code, status.HTTP_200_OK, health_response.data)
        self.assertEqual(health_response.data["detail"], "AI assistant ingestion controls are active")
        self.assertEqual(sources_response.status_code, status.HTTP_200_OK, sources_response.data)
        self.assertEqual(sources_response.data, [])
        self.assertEqual(query_response.status_code, status.HTTP_200_OK, query_response.data)
        self.assertEqual(
            query_response.data["answer"],
            "I do not have enough approved source material to answer this.",
        )
        self.assertEqual(query_response.data["citations"], [])
        self.assertEqual(query_response.data["confidence"], "LOW")
        self.assertEqual(query_response.data["retrieval_mode"], "KEYWORD")
        self.assertFalse(query_response.data["safety"]["source_grounded"])
