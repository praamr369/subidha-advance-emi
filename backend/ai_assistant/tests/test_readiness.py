from __future__ import annotations

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from ai_assistant.models import AIKnowledgeChunk, AIKnowledgeSource, AIQueryLog
from tests.helpers import create_admin_user, create_partner_user


class AIAssistantReadinessTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_readiness_admin", phone="919100001501")
        self.partner = create_partner_user(username="ai_readiness_partner", phone="919100001502")

    @override_settings(AI_ASSISTANT_ENABLED=True, AI_EMBEDDINGS_ENABLED=False, AI_VECTOR_SEARCH_ENABLED=False)
    def test_readiness_endpoint_returns_safe_status(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Runbook",
            source_type=AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
            status=AIKnowledgeSource.Status.ACTIVE,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="Safe content",
            created_by=self.admin,
        )
        AIKnowledgeChunk.objects.create(
            source=source,
            chunk_index=0,
            heading="H",
            content="Safe content",
            token_count=2,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
        )
        AIQueryLog.objects.create(query="q", role="ADMIN")
        response = self.client.get("/api/v1/admin/ai/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data["feature_flags"]["embeddings_enabled"])
        self.assertEqual(response.data["retrieval"]["default_mode"], "KEYWORD")
        self.assertTrue(response.data["safety"]["read_only"])
        self.assertFalse(response.data["safety"]["financial_actions_enabled"])
        self.assertGreaterEqual(response.data["knowledge_base"]["sources_total"], 1)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_blocked(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/ai/readiness/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

