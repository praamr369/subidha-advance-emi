from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from ai_assistant.models import AIEmbedding, AIKnowledgeChunk, AIKnowledgeSource, AIQueryLog
from tests.helpers import create_admin_user, create_partner_user


class AIAssistantIngestionApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ai_ingest_admin", phone="919100001201")
        self.partner = create_partner_user(username="ai_ingest_partner", phone="919100001202")

    @override_settings(AI_ASSISTANT_ENABLED=False)
    def test_disabled_ai_returns_503_for_sources_and_ingest(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/ai/sources/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_non_admin_is_blocked(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/ai/sources/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_can_create_safe_source(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "title": "Ops Runbook",
            "source_type": "INTERNAL_RUNBOOK",
            "status": "DRAFT",
            "visibility": "ADMIN_ONLY",
            "content_text": "# Restore\nStep 1\nStep 2",
        }
        response = self.client.post("/api/v1/admin/ai/sources/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["source_type"], "INTERNAL_RUNBOOK")
        self.assertEqual(response.data["visibility"], "ADMIN_ONLY")

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_forbidden_filename_is_rejected(self):
        self.client.force_authenticate(self.admin)
        upload = SimpleUploadedFile(".env.md", b"# bad\ntext", content_type="text/markdown")
        response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Bad Upload",
                "source_type": "POLICY",
                "status": "DRAFT",
                "visibility": "ADMIN_ONLY",
                "uploaded_file": upload,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_forbidden_source_url_is_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Bad Source URL",
                "source_type": "POLICY",
                "status": "DRAFT",
                "visibility": "ADMIN_ONLY",
                "source_url": "exports/payment_ledger_dump.md",
                "content_text": "# Policy\nSafe public text",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AIKnowledgeSource.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_secret_content_is_rejected_and_not_stored(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/sources/",
            {
                "title": "Secrets",
                "source_type": "FAQ",
                "status": "DRAFT",
                "visibility": "ADMIN_ONLY",
                "content_text": "SECRET_KEY=abc123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AIKnowledgeSource.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_admin_can_ingest_safe_markdown_source_and_create_chunks(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Policy",
            source_type=AIKnowledgeSource.SourceType.POLICY,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="# Heading\n" + ("A " * 2200),
            created_by=self.admin,
        )
        response = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        source.refresh_from_db()
        self.assertEqual(source.status, AIKnowledgeSource.Status.ACTIVE)
        self.assertGreater(AIKnowledgeChunk.objects.filter(source=source).count(), 0)
        self.assertIn("chunk_count", source.metadata)
        self.assertIn("checksum", source.metadata)
        self.assertIn("ingestion_started_at", source.metadata)
        self.assertIn("ingestion_completed_at", source.metadata)
        self.assertEqual(AIEmbedding.objects.count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_chunking_is_deterministic_for_same_source(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="FAQ",
            source_type=AIKnowledgeSource.SourceType.FAQ,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="# FAQ\n" + ("Deterministic content. " * 600),
            created_by=self.admin,
        )

        first = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        first_chunks = list(
            AIKnowledgeChunk.objects.filter(source=source)
            .order_by("chunk_index")
            .values_list("chunk_index", "heading", "content", "token_count")
        )

        second = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        second_chunks = list(
            AIKnowledgeChunk.objects.filter(source=source)
            .order_by("chunk_index")
            .values_list("chunk_index", "heading", "content", "token_count")
        )
        self.assertEqual(first_chunks, second_chunks)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_ingestion_failure_sets_failed_status(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Bad inline",
            source_type=AIKnowledgeSource.SourceType.SYSTEM_HELP,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="DATABASE_URL=postgres://secret",
            created_by=self.admin,
        )
        response = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        source.refresh_from_db()
        self.assertEqual(source.status, AIKnowledgeSource.Status.FAILED)
        self.assertTrue(source.metadata.get("ingestion_error"))
        self.assertEqual(AIKnowledgeChunk.objects.filter(source=source).count(), 0)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_chunk_list_returns_preview_not_full_content(self):
        self.client.force_authenticate(self.admin)
        source = AIKnowledgeSource.objects.create(
            title="Public page",
            source_type=AIKnowledgeSource.SourceType.PUBLIC_PAGE,
            status=AIKnowledgeSource.Status.DRAFT,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            content_text="# Help\n" + ("X " * 1800),
            created_by=self.admin,
        )
        ingest = self.client.post(f"/api/v1/admin/ai/sources/{source.id}/ingest/", {}, format="json")
        self.assertEqual(ingest.status_code, status.HTTP_200_OK, ingest.data)

        chunks = self.client.get(f"/api/v1/admin/ai/sources/{source.id}/chunks/")
        self.assertEqual(chunks.status_code, status.HTTP_200_OK, chunks.data)
        self.assertTrue(len(chunks.data) > 0)
        first = chunks.data[0]
        self.assertIn("content_preview", first)
        self.assertNotIn("content", first)
        self.assertIn("token_count", first)
        self.assertIn("chunk_index", first)

    @override_settings(AI_ASSISTANT_ENABLED=True)
    def test_query_endpoint_logs_no_source_response(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/ai/query/",
            {"query": "How to close monthly process?", "scope": "INTERNAL_DOCS"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["answer"],
            "I do not have enough approved source material to answer this.",
        )
        self.assertEqual(response.data["citations"], [])
        self.assertEqual(response.data["retrieval_mode"], "KEYWORD")
        query_log = AIQueryLog.objects.get()
        self.assertEqual(query_log.denied_reason, "NO_APPROVED_SOURCE")
        self.assertEqual(query_log.retrieved_chunk_ids, [])
