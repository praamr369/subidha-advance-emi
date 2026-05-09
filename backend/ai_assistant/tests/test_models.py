from django.test import TestCase

from ai_assistant.models import (
    AIFeedback,
    AIEmbedding,
    AIKnowledgeChunk,
    AIKnowledgeSource,
    AIQueryLog,
)
from tests.helpers import create_admin_user


class AIAssistantModelTests(TestCase):
    def test_models_create_cleanly_without_execution_side_effects(self):
        admin = create_admin_user(username="ai_model_admin", phone="919100001001")
        source = AIKnowledgeSource.objects.create(
            title="Backup Restore Runbook",
            source_type=AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
            source_url="docs/operations/backup-restore-runbook.md",
            created_by=admin,
        )
        chunk = AIKnowledgeChunk.objects.create(
            source=source,
            chunk_index=0,
            heading="Restore Procedure",
            content="Stop write traffic before restore.",
            token_count=6,
            visibility=AIKnowledgeSource.Visibility.ADMIN_ONLY,
        )
        embedding = AIEmbedding.objects.create(
            chunk=chunk,
            embedding=None,
            embedding_model="",
            dimensions=0,
            content_hash="hash-placeholder",
        )
        query_log = AIQueryLog.objects.create(
            user=admin,
            role="ADMIN",
            query="How do I restore from backup?",
            retrieval_mode=AIQueryLog.RetrievalMode.KEYWORD,
            retrieved_chunk_ids=[chunk.id],
            answer_preview="AI assistant not yet active",
        )
        feedback = AIFeedback.objects.create(
            query_log=query_log,
            user=admin,
            rating=AIFeedback.Rating.HELPFUL,
            comment="Skeleton feedback",
        )

        self.assertEqual(source.status, AIKnowledgeSource.Status.DRAFT)
        self.assertEqual(chunk.source_id, source.id)
        self.assertEqual(embedding.chunk_id, chunk.id)
        self.assertEqual(query_log.normalized_query, "How do I restore from backup?")
        self.assertEqual(feedback.rating, AIFeedback.Rating.HELPFUL)
