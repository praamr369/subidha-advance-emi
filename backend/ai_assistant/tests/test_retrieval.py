from __future__ import annotations

from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from ai_assistant.models import AIFeedback, AIEmbedding, AIKnowledgeChunk, AIKnowledgeSource, AIQueryLog
from tests.helpers import create_admin_user, create_partner_user


class AIAssistantRetrievalTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_retrieval_admin", phone="919100001301")
        self.partner = create_partner_user(username="ai_retrieval_partner", phone="919100001302")

    def _source(
        self,
        *,
        title: str = "Backup Restore Runbook",
        status_value: str = AIKnowledgeSource.Status.ACTIVE,
        visibility: str = AIKnowledgeSource.Visibility.ADMIN_ONLY,
        source_type: str = AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
        content: str = "Restore Procedure: reset business data only after backup verification.",
    ) -> AIKnowledgeSource:
        source = AIKnowledgeSource.objects.create(
            title=title,
            source_type=source_type,
            status=status_value,
            visibility=visibility,
            content_text=content,
            created_by=self.admin,
        )
        AIKnowledgeChunk.objects.create(
            source=source,
            chunk_index=0,
            heading="Restore Procedure",
            content=content,
            token_count=len(content.split()),
            visibility=visibility,
        )
        return source

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_disabled_query_returns_503(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "AI assistant is disabled")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_query_blocked(self):
        self.client.force_authenticate(self.partner)
        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_enabled_admin_query_returns_no_source_when_no_chunks_exist(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How do I reset business data safely?", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["answer"],
            "I do not have enough approved source material to answer this.",
        )
        self.assertEqual(response.data["citations"], [])
        self.assertEqual(response.data["confidence"], "LOW")
        self.assertEqual(response.data["retrieval_mode"], "KEYWORD")
        self.assertFalse(response.data["safety"]["source_grounded"])

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_enabled_admin_query_retrieves_active_admin_only_chunk_with_citations(self):
        self.client.force_authenticate(self.admin)
        source = self._source(
            content=(
                "Restore Procedure: reset business data safely by verifying the latest backup, "
                "recording approval, and following the restore checklist."
            )
        )

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "reset business data safely", "scope": "INTERNAL_DOCS", "top_k": 5},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("Based on approved internal documents", response.data["answer"])
        self.assertEqual(response.data["retrieval_mode"], "KEYWORD")
        self.assertTrue(response.data["safety"]["permission_filtered"])
        self.assertTrue(response.data["safety"]["source_grounded"])
        self.assertGreaterEqual(len(response.data["citations"]), 1)
        citation = response.data["citations"][0]
        self.assertEqual(citation["source_id"], source.id)
        self.assertEqual(citation["source_title"], "Backup Restore Runbook")
        self.assertEqual(citation["heading"], "Restore Procedure")
        self.assertIn("excerpt", citation)
        self.assertLessEqual(len(citation["excerpt"]), 320)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_draft_failed_archived_sources_are_excluded(self):
        self.client.force_authenticate(self.admin)
        for status_value in [
            AIKnowledgeSource.Status.DRAFT,
            AIKnowledgeSource.Status.FAILED,
            AIKnowledgeSource.Status.ARCHIVED,
        ]:
            self._source(
                title=f"{status_value} restore guide",
                status_value=status_value,
                content=f"Restore Procedure: {status_value} source says reset business data.",
            )

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "reset business data", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["citations"], [])
        self.assertEqual(response.data["confidence"], "LOW")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_visibility_sources_are_excluded(self):
        self.client.force_authenticate(self.admin)
        self._source(
            title="Staff Restore Guide",
            visibility=AIKnowledgeSource.Visibility.STAFF,
            content="Restore Procedure: reset business data from a staff-only guide.",
        )

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "reset business data", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["citations"], [])
        self.assertEqual(response.data["safety"]["source_grounded"], False)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_blocked_unsafe_chunk_content_is_excluded_from_retrieval(self):
        self.client.force_authenticate(self.admin)
        self._source(
            title="Unsafe Restore Guide",
            content="Restore Procedure: reset business data. SECRET_KEY=unsafe-value",
        )

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "reset business data", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["citations"], [])
        self.assertEqual(response.data["answer"], "I do not have enough approved source material to answer this.")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_query_log_stores_retrieved_chunk_ids_and_answer_preview(self):
        self.client.force_authenticate(self.admin)
        source = self._source()
        chunk = source.chunks.get()

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "restore procedure", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        query_log = AIQueryLog.objects.get(id=response.data["query_log_id"])
        self.assertEqual(query_log.retrieval_mode, AIQueryLog.RetrievalMode.KEYWORD)
        self.assertEqual(query_log.retrieved_chunk_ids, [chunk.id])
        self.assertIn("Based on approved internal documents", query_log.answer_preview)
        self.assertIsNone(query_log.denied_reason)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_feedback_can_be_submitted_for_admin_query(self):
        self.client.force_authenticate(self.admin)
        self._source()
        query_response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "restore procedure", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(query_response.status_code, status.HTTP_200_OK, query_response.data)

        response = self.client.post(
            "/api/v1/admin/ai/feedback/",
            {"query_log": query_response.data["query_log_id"], "rating": "HELPFUL", "comment": "Useful"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(AIFeedback.objects.count(), 1)
        feedback = AIFeedback.objects.get()
        self.assertEqual(feedback.user, self.admin)
        self.assertEqual(feedback.rating, AIFeedback.Rating.HELPFUL)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_query_log_list_is_read_only_and_includes_feedback_status(self):
        self.client.force_authenticate(self.admin)
        self._source()
        query_response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "restore procedure", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(query_response.status_code, status.HTTP_200_OK, query_response.data)
        feedback_response = self.client.post(
            "/api/v1/admin/ai/feedback/",
            {"query_log": query_response.data["query_log_id"], "rating": "HELPFUL", "comment": "Useful"},
            format="json",
        )
        self.assertEqual(feedback_response.status_code, status.HTTP_201_CREATED, feedback_response.data)

        response = self.client.get("/api/v1/admin/ai/query-log/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["query"], "restore procedure")
        self.assertEqual(response.data[0]["retrieval_mode"], AIQueryLog.RetrievalMode.KEYWORD)
        self.assertEqual(response.data[0]["feedback_status"], AIFeedback.Rating.HELPFUL)
        self.assertNotIn("citations", response.data[0])

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_financial_action_request_refuses_action_without_mutation(self):
        self.client.force_authenticate(self.admin)
        self._source(
            title="Payment Process Runbook",
            content=(
                "Payment Procedure: staff must verify customer and subscription before recording "
                "a payment through the approved cashier workflow."
            ),
        )

        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "collect payment for this customer", "scope": "INTERNAL_DOCS"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["answer"],
            "I can explain the approved process, but I cannot perform or approve financial or operational actions.",
        )
        self.assertEqual(response.data["confidence"], "MEDIUM")
        self.assertTrue(response.data["safety"]["actionable_financial_instruction"])
        self.assertTrue(response.data["citations"])
        self.assertEqual(AIEmbedding.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_query_does_not_create_embeddings_or_external_calls(self):
        self.client.force_authenticate(self.admin)
        self._source()

        with patch("urllib.request.urlopen") as urlopen:
            response = self.client.post(
                "/api/v1/admin/ai/query/",
                {"query": "restore procedure", "scope": "INTERNAL_DOCS"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        urlopen.assert_not_called()
        self.assertEqual(AIEmbedding.objects.count(), 0)
