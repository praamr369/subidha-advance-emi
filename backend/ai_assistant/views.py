import time

from rest_framework import permissions, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_assistant.models import AIKnowledgeChunk, AIKnowledgeSource, AIQueryLog
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
from ai_assistant.services.retrieval_service import retrieve_chunks


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

        retrieved_chunks = retrieve_chunks(
            user=request.user,
            query=query,
            top_k=top_k,
            scope=scope,
        )
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
        )
        return Response(
            {
                "answer": answer.answer,
                "citations": answer.citations,
                "confidence": answer.confidence,
                "retrieval_mode": "KEYWORD",
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
        payload = explain_bi_summary(user=request.user, scope=scope, window=window)

        log_ai_query(
            user=request.user,
            query=f"BI_EXPLAIN:{scope}:{window}",
            metadata={"scope": scope, "window": window, "mode": "BI_EXPLANATION"},
            retrieved_chunk_ids=[],
            answer_preview=payload.get("summary", ""),
            latency_ms=0,
            denied_reason=None,
        )
        return Response(payload, status=status.HTTP_200_OK)
