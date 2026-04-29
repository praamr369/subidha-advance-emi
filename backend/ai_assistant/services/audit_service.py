from __future__ import annotations

from ai_assistant.models import AIQueryLog
from subscriptions.models import AuditLog


def log_ai_query(
    *,
    user,
    query: str,
    metadata: dict | None = None,
    retrieved_chunk_ids: list[int] | None = None,
    answer_preview: str = "",
    latency_ms: int = 0,
    denied_reason: str | None = None,
    requested_retrieval_mode: str = "",
    actual_retrieval_mode: str = AIQueryLog.RetrievalMode.KEYWORD,
    degraded: bool = False,
    degraded_reason: str = "",
) -> AIQueryLog:
    query_log = AIQueryLog.objects.create(
        user=user,
        role=(getattr(user, "role", "") or "").strip().upper(),
        query=(query or "").strip(),
        retrieval_mode=actual_retrieval_mode or AIQueryLog.RetrievalMode.KEYWORD,
        requested_retrieval_mode=(requested_retrieval_mode or "").upper().strip(),
        degraded=bool(degraded),
        degraded_reason=(degraded_reason or "").strip(),
        filters=metadata or {},
        retrieved_chunk_ids=retrieved_chunk_ids or [],
        answer_preview=(answer_preview or "")[:500],
        latency_ms=max(0, int(latency_ms or 0)),
        denied_reason=denied_reason,
    )
    AuditLog.objects.create(
        action_type=AuditLog.ActionType.USER_UPDATED,
        performed_by=user,
        model_name="AIQueryLog",
        object_id=query_log.id,
        metadata={
            "query_log_id": query_log.id,
            "event": "QUERY_RETRIEVAL_LOGGED",
            "retrieved_chunk_ids": retrieved_chunk_ids or [],
            "denied_reason": denied_reason,
            **(metadata or {}),
        },
    )
    return query_log


def log_ai_ingestion(*, user, source_id: int, event: str, metadata: dict | None = None) -> None:
    AuditLog.objects.create(
        action_type=AuditLog.ActionType.USER_UPDATED,
        performed_by=user,
        model_name="AIKnowledgeSource",
        object_id=source_id,
        metadata={
            "event": event,
            **(metadata or {}),
        },
    )
