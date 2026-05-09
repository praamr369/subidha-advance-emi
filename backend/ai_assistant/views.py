import time

from rest_framework import permissions, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from django.conf import settings

from ai_assistant.models import AIFeedback, AIEmbedding, AIKnowledgeChunk, AIKnowledgeSource, AIQueryLog
from ai_assistant.permissions import IsAdminAIEnabled
from ai_assistant.serializers import (
    AIBIExplainRequestSerializer,
    AIFeedbackSerializer,
    AIKnowledgeChunkSerializer,
    AIKnowledgeSourceCreateSerializer,
    AIKnowledgeSourceSerializer,
    AIQueryLogSerializer,
    AIQueryRequestSerializer,
)
from ai_assistant.services.answer_service import answer_query
from ai_assistant.services.audit_service import log_ai_ingestion, log_ai_query
from ai_assistant.services.bi_explanation_service import explain_bi_summary
from ai_assistant.services.ingestion_service import AIIngestionError, ingest_source
from ai_assistant.services.retrieval_service import execute_retrieval


class AIAssistantBaseView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminAIEnabled]


class AIAssistantHealthView(AIAssistantBaseView):
    def get(self, request):
        return Response({"detail": "AI assistant ingestion controls are active"})


class AIKnowledgeSourceListCreateView(AIAssistantBaseView):
    def get(self, request):
        queryset = AIKnowledgeSource.objects.all().order_by("-updated_at", "-id")
        serializer = AIKnowledgeSourceSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = AIKnowledgeSourceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source = serializer.save(created_by=request.user)
        log_ai_ingestion(
            user=request.user,
            source_id=source.id,
            event="SOURCE_CREATED",
            metadata={"source_type": source.source_type, "status": source.status},
        )
        return Response(AIKnowledgeSourceSerializer(source).data, status=status.HTTP_201_CREATED)


class AIKnowledgeSourceDetailView(AIAssistantBaseView):
    def get(self, request, source_id: int):
        source = get_object_or_404(AIKnowledgeSource, id=source_id)
        serializer = AIKnowledgeSourceSerializer(source)
        return Response(serializer.data)


class AIKnowledgeSourceIngestView(AIAssistantBaseView):
    def post(self, request, source_id: int):
        source = get_object_or_404(AIKnowledgeSource, id=source_id)
        try:
            result = ingest_source(source=source)
        except AIIngestionError as exc:
            log_ai_ingestion(
                user=request.user,
                source_id=source.id,
                event="INGESTION_FAILED",
                metadata={"error": str(exc)},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        log_ai_ingestion(
            user=request.user,
            source_id=source.id,
            event="INGESTION_COMPLETED",
            metadata={
                "chunk_count": result["chunk_count"],
                "checksum": result["checksum"],
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class AIKnowledgeSourceChunkListView(AIAssistantBaseView):
    def get(self, request, source_id: int):
        source = get_object_or_404(AIKnowledgeSource, id=source_id)
        queryset = AIKnowledgeChunk.objects.filter(source=source).order_by("chunk_index", "id")
        serializer = AIKnowledgeChunkSerializer(queryset, many=True)
        return Response(serializer.data)


class AIAssistantQueryView(AIAssistantBaseView):
    def post(self, request):
        started = time.monotonic()
        serializer = AIQueryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data["query"]
        scope = serializer.validated_data.get("scope")
        top_k = serializer.validated_data.get("top_k") or 5
        requested_retrieval_mode = serializer.validated_data.get("retrieval_mode") or "AUTO"

        retrieval = execute_retrieval(
            user=request.user,
            query=query,
            top_k=top_k,
            scope=scope,
            requested_mode=requested_retrieval_mode,
        )
        retrieved_chunks = retrieval.chunks
        answer = answer_query(query=query, retrieved_chunks=retrieved_chunks)
        latency_ms = int((time.monotonic() - started) * 1000)
        retrieved_chunk_ids = [chunk.chunk_id for chunk in retrieved_chunks]
        denied_reason = None if retrieved_chunk_ids else "NO_APPROVED_SOURCE"
        query_log = log_ai_query(
            user=request.user,
            query=query,
            metadata={"scope": scope, "top_k": top_k},
            retrieved_chunk_ids=retrieved_chunk_ids,
            answer_preview=answer.answer,
            latency_ms=latency_ms,
            denied_reason=denied_reason,
            requested_retrieval_mode=retrieval.requested_mode,
            actual_retrieval_mode=retrieval.actual_mode,
            degraded=retrieval.degraded,
            degraded_reason=retrieval.degraded_reason,
        )
        return Response(
            {
                "answer": answer.answer,
                "citations": answer.citations,
                "confidence": answer.confidence,
                "retrieval_mode": retrieval.actual_mode,
                "requested_retrieval_mode": retrieval.requested_mode,
                "degraded": retrieval.degraded,
                "degraded_reason": retrieval.degraded_reason,
                "query_log_id": query_log.id,
                "safety": {
                    "actionable_financial_instruction": answer.actionable_financial_instruction,
                    "permission_filtered": True,
                    "source_grounded": bool(answer.citations),
                },
            },
            status=status.HTTP_200_OK,
        )


class AIQueryLogListView(AIAssistantBaseView):
    def get(self, request):
        queryset = (
            AIQueryLog.objects.select_related("user")
            .prefetch_related("feedback")
            .order_by("-created_at", "-id")[:100]
        )
        serializer = AIQueryLogSerializer(queryset, many=True)
        return Response(serializer.data)


class AIFeedbackView(AIAssistantBaseView):
    def post(self, request):
        serializer = AIFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = serializer.save(user=request.user)
        return Response(AIFeedbackSerializer(feedback).data, status=status.HTTP_201_CREATED)


class AIBIExplainView(AIAssistantBaseView):
    def get(self, request):
        serializer = AIBIExplainRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        scope = serializer.validated_data.get("scope", "ADMIN_BI")
        window = serializer.validated_data.get("window", "THIS_MONTH")
        topic = serializer.validated_data.get("topic", "SUMMARY")
        payload = explain_bi_summary(user=request.user, scope=scope, window=window, topic=topic)

        log_ai_query(
            user=request.user,
            query=f"BI_EXPLAIN:{scope}:{window}:{topic}",
            metadata={"scope": scope, "window": window, "topic": topic, "mode": "BI_EXPLANATION"},
            retrieved_chunk_ids=[],
            answer_preview=payload.get("summary", ""),
            latency_ms=0,
            denied_reason=None,
        )
        return Response(payload, status=status.HTTP_200_OK)


class AIAssistantReadinessView(AIAssistantBaseView):
    def get(self, request):
        sources_total = AIKnowledgeSource.objects.count()
        sources_active = AIKnowledgeSource.objects.filter(status=AIKnowledgeSource.Status.ACTIVE).count()
        chunks_total = AIKnowledgeChunk.objects.count()
        embedded_chunks = AIEmbedding.objects.count()
        failed_sources = AIKnowledgeSource.objects.filter(status=AIKnowledgeSource.Status.FAILED).count()
        last_source = AIKnowledgeSource.objects.order_by("-updated_at", "-id").first()
        unsafe_ingestion_count = AIKnowledgeSource.objects.filter(metadata__ingestion_error__icontains="blocked").count()

        if not getattr(settings, "AI_VECTOR_SEARCH_ENABLED", False):
            default_mode = "KEYWORD"
        elif not getattr(settings, "AI_EMBEDDINGS_ENABLED", False):
            default_mode = "KEYWORD"
        else:
            default_mode = "HYBRID"

        recommendations = []
        if not getattr(settings, "AI_ASSISTANT_ENABLED", False):
            recommendations.append("Enable AI_ASSISTANT_ENABLED only after rollout checklist completion.")
        if getattr(settings, "AI_ASSISTANT_ENABLED", False) and not getattr(settings, "AI_EMBEDDINGS_ENABLED", False):
            recommendations.append("System is running in keyword-only mode; embeddings can remain disabled for safe operation.")
        if sources_active == 0:
            recommendations.append("Activate at least one approved AI source for consistent citations.")
        if sources_active > 0 and chunks_total == 0:
            recommendations.append("Re-ingest active sources to populate retrievable chunks.")
        if failed_sources > 0:
            recommendations.append("Review failed sources and re-ingest after fixing content safety or formatting issues.")

        return Response(
            {
                "feature_flags": {
                    "ai_assistant_enabled": bool(getattr(settings, "AI_ASSISTANT_ENABLED", False)),
                    "embeddings_enabled": bool(getattr(settings, "AI_EMBEDDINGS_ENABLED", False)),
                    "vector_search_enabled": bool(getattr(settings, "AI_VECTOR_SEARCH_ENABLED", False)),
                },
                "knowledge_base": {
                    "sources_total": sources_total,
                    "sources_active": sources_active,
                    "chunks_total": chunks_total,
                    "embedded_chunks": embedded_chunks,
                    "failed_sources": failed_sources,
                },
                "retrieval": {
                    "default_mode": default_mode,
                    "vector_available": bool(getattr(settings, "AI_VECTOR_SEARCH_ENABLED", False))
                    and bool(getattr(settings, "AI_EMBEDDINGS_ENABLED", False)),
                    "fallback_enabled": True,
                },
                "safety": {
                    "read_only": True,
                    "financial_actions_enabled": False,
                    "customer_private_ingestion_enabled": False,
                },
                "last_activity": {
                    "last_ingestion_status": (last_source.metadata or {}).get("ingestion_error", "") if last_source else "",
                    "last_source_title": last_source.title if last_source else "",
                    "query_logs_count": AIQueryLog.objects.count(),
                    "feedback_count": AIFeedback.objects.count(),
                    "unsafe_blocked_ingestion_count": unsafe_ingestion_count,
                },
                "recommendations": recommendations,
            }
        )
