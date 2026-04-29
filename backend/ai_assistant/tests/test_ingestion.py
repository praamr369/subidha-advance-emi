from __future__ import annotations

from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from ai_assistant.models import AIEmbedding, AIKnowledgeChunk, AIKnowledgeSource
from tests.helpers import create_admin_user, create_partner_user


SAFE_MARKDOWN = """
# Collections Runbook
## Shift Start
Verify desk balances before opening counters.

## Collection Procedure
Collect payment only after customer and subscription verification.
Issue receipt and update posting references.

## Reconciliation
Escalate mismatches to reconciliation queue.
""".strip()


class AIAssistantIngestionApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_ingest_admin", phone="919100001201")
        self.partner = create_partner_user(username="ai_ingest_partner", phone="919100001202")

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_disabled_ai_returns_503(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/ai/sources/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "AI assistant is disabled")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_blocked(self):
        self.client.force_authenticate(self.partner)
        response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Partner Upload",
                "source_type": AIKnowledgeSource.SourceType.FAQ,
                "visibility": AIKnowledgeSource.Visibility.ADMIN_ONLY,
                "content_text": SAFE_MARKDOWN,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_can_create_safe_source_and_view_detail(self):
        self.client.force_authenticate(self.admin)
        create_response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Internal Collections FAQ",
                "source_type": AIKnowledgeSource.SourceType.FAQ,
                "visibility": AIKnowledgeSource.Visibility.ADMIN_ONLY,
                "content_text": SAFE_MARKDOWN,
                "status": AIKnowledgeSource.Status.DRAFT,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        source_id = create_response.data["id"]
        self.assertTrue(create_response.data["has_inline_content"])

        detail_response = self.client.get(f"/api/v1/admin/ai/sources/{source_id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK, detail_response.data)
        self.assertEqual(detail_response.data["title"], "Internal Collections FAQ")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_can_ingest_safe_markdown_source_and_chunks_are_deterministic(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Operations System Help",
            source_type=AIKnowledgeSource.SourceType.SYSTEM_HELP,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text=SAFE_MARKDOWN,
            created_by=self.admin,
        )

        ingest_url = f"/api/v1/admin/ai/sources/{source.id}/ingest/"
        first = self.client.post(ingest_url, {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(first.data["status"], AIKnowledgeSource.Status.ACTIVE)
        first_chunk_rows = list(
            AIKnowledgeChunk.objects.filter(source=source).order_by("chunk_index").values(
                "chunk_index", "heading", "content", "token_count"
            )
        )
        self.assertGreater(len(first_chunk_rows), 0)
        self.assertEqual(AIEmbedding.objects.count(), 0)

        second = self.client.post(ingest_url, {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        second_chunk_rows = list(
            AIKnowledgeChunk.objects.filter(source=source).order_by("chunk_index").values(
                "chunk_index", "heading", "content", "token_count"
            )
        )
        self.assertEqual(first_chunk_rows, second_chunk_rows)
        self.assertEqual(first.data["chunk_count"], second.data["chunk_count"])

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_secret_content_rejected_and_not_stored(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Unsafe Secret Text",
                "source_type": AIKnowledgeSource.SourceType.POLICY,
                "visibility": AIKnowledgeSource.Visibility.ADMIN_ONLY,
                "content_text": "DATABASE_URL=postgres://secret",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AIKnowledgeSource.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_forbidden_filename_rejected(self):
        self.client.force_authenticate(self.admin)
        source_response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Blocked Filename",
                "source_type": AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
                "status": AIKnowledgeSource.Status.DRAFT,
                "visibility": AIKnowledgeSource.Visibility.ADMIN_ONLY,
                "uploaded_file": SimpleUploadedFile(
                    "secret_dump.md",
                    SAFE_MARKDOWN.encode("utf-8"),
                    content_type="text/markdown",
                ),
            },
            format="multipart",
        )
        self.assertEqual(source_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AIKnowledgeSource.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_ingest_secret_content_rejected_and_source_marked_failed(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Unsafe Content",
            source_type=AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="Runbook\nDATABASE_URL=postgres://unsafe",
            created_by=self.admin,
        )
        response = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        source.refresh_from_db()
        self.assertEqual(source.status, AIKnowledgeSource.Status.FAILED)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_chunk_list_returns_preview_and_not_full_content_field(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Policy Source",
            source_type=AIKnowledgeSource.SourceType.POLICY,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text=SAFE_MARKDOWN,
            created_by=self.admin,
        )
        ingest_response = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(ingest_response.status_code, status.HTTP_200_OK, ingest_response.data)

        chunk_response = self.client.get(f"/api/v1/admin/ai/sources/{source.id}/chunks/")
        self.assertEqual(chunk_response.status_code, status.HTTP_200_OK, chunk_response.data)
        self.assertGreater(len(chunk_response.data), 0)
        self.assertIn("content_preview", chunk_response.data[0])
        self.assertNotIn("content", chunk_response.data[0])

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_query_endpoint_returns_no_source_response_without_chunks(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How to collect safely?", "scope": "INTERNAL_DOCS"},
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
