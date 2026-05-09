from __future__ import annotations

import re
from dataclasses import dataclass

from django.db.models import Q

from ai_assistant.services.embedding_service import (
    embed_text,
    embeddings_enabled,
    vector_candidates_for_chunks,
    vector_search_enabled,
)
from ai_assistant.services.ingestion_service import content_is_blocked_by_policy
from ai_assistant.services.permission_filter_service import phase_8d_chunk_queryset


TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]*", re.IGNORECASE)
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "do",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "with",
}


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    source_id: int
    source_title: str
    heading: str
    preview: str
    score: int
    content: str

    def as_response_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "source_id": self.source_id,
            "source_title": self.source_title,
            "heading": self.heading,
            "preview": self.preview,
            "score": self.score,
        }


@dataclass(frozen=True)
class RetrievalExecution:
    requested_mode: str
    actual_mode: str
    degraded: bool
    degraded_reason: str
    chunks: list[RetrievedChunk]


def _tokens(text: str) -> list[str]:
    return [
        token.lower()
        for token in TOKEN_RE.findall(text or "")
        if len(token) > 2 and token.lower() not in STOP_WORDS
    ]


def _preview(text: str, limit: int = 320) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def _score_chunk(*, query: str, keywords: list[str], chunk) -> int:
    content = chunk.content or ""
    heading = chunk.heading or ""
    title = chunk.source.title or ""
    content_lower = content.lower()
    heading_lower = heading.lower()
    title_lower = title.lower()
    query_lower = query.lower().strip()

    score = 0
    if query_lower and query_lower in content_lower:
        score += 80
    if query_lower and query_lower in heading_lower:
        score += 50
    if query_lower and query_lower in title_lower:
        score += 40

    for keyword in keywords:
        content_hits = content_lower.count(keyword)
        heading_hits = heading_lower.count(keyword)
        title_hits = title_lower.count(keyword)
        score += min(content_hits, 8) * 4
        score += heading_hits * 12
        score += title_hits * 10

    return score


def retrieve_chunks(*, user, query: str, top_k: int = 5, scope: str | None = None) -> list[RetrievedChunk]:
    result = execute_retrieval(user=user, query=query, top_k=top_k, scope=scope, requested_mode="AUTO")
    return result.chunks


def execute_retrieval(
    *,
    user,
    query: str,
    top_k: int = 5,
    scope: str | None = None,
    requested_mode: str = "AUTO",
) -> RetrievalExecution:
    del scope
    normalized_query = " ".join((query or "").split())
    keywords = _tokens(normalized_query)
    requested = (requested_mode or "AUTO").upper().strip()
    if requested not in {"AUTO", "KEYWORD", "VECTOR", "HYBRID"}:
        requested = "AUTO"
    if not normalized_query or not keywords:
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=requested in {"VECTOR", "HYBRID"},
            degraded_reason="EMPTY_QUERY_OR_KEYWORDS" if requested in {"VECTOR", "HYBRID"} else "",
            chunks=[],
        )

    queryset = phase_8d_chunk_queryset(user)
    text_filter = Q()
    for keyword in keywords[:8]:
        text_filter |= Q(content__icontains=keyword)
        text_filter |= Q(heading__icontains=keyword)
        text_filter |= Q(source__title__icontains=keyword)

    if text_filter:
        queryset = queryset.filter(text_filter)

    chunk_rows = []
    for chunk in queryset.order_by("source_id", "chunk_index", "id")[:500]:
        if content_is_blocked_by_policy(chunk.content):
            continue
        chunk_rows.append(chunk)

    keyword_scored: list[RetrievedChunk] = []
    for chunk in chunk_rows:
        keyword_score = _score_chunk(query=normalized_query, keywords=keywords, chunk=chunk)
        if keyword_score <= 0:
            continue
        keyword_scored.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                source_id=chunk.source_id,
                source_title=chunk.source.title,
                heading=chunk.heading,
                preview=_preview(chunk.content),
                score=keyword_score,
                content=chunk.content,
            )
        )

    keyword_scored.sort(key=lambda item: (-item.score, item.source_id, item.chunk_id))
    capped_top_k = max(1, min(int(top_k or 5), 10))

    mode = requested
    if mode == "AUTO":
        mode = "HYBRID" if vector_search_enabled() else "KEYWORD"

    if mode == "KEYWORD":
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=False,
            degraded_reason="",
            chunks=keyword_scored[:capped_top_k],
        )

    if mode in {"VECTOR", "HYBRID"} and not vector_search_enabled():
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=True,
            degraded_reason="VECTOR_SEARCH_DISABLED",
            chunks=keyword_scored[:capped_top_k],
        )
    if mode in {"VECTOR", "HYBRID"} and not embeddings_enabled():
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=True,
            degraded_reason="EMBEDDINGS_DISABLED",
            chunks=keyword_scored[:capped_top_k],
        )

    query_embedding_payload = embed_text(normalized_query)
    if not query_embedding_payload.get("embedded"):
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=True,
            degraded_reason=query_embedding_payload.get("reason") or "QUERY_EMBEDDING_UNAVAILABLE",
            chunks=keyword_scored[:capped_top_k],
        )

    vector_scores = vector_candidates_for_chunks(
        chunk_rows,
        query_embedding=query_embedding_payload["embedding"],
        top_k=max(capped_top_k * 4, 10),
    )
    if not vector_scores:
        return RetrievalExecution(
            requested_mode=requested,
            actual_mode="KEYWORD",
            degraded=True,
            degraded_reason="NO_VECTOR_CANDIDATES",
            chunks=keyword_scored[:capped_top_k],
        )

    vector_score_map = {row["chunk_id"]: float(row["score"]) for row in vector_scores}
    by_id = {row.chunk_id: row for row in keyword_scored}
    for chunk in chunk_rows:
        if chunk.id not in by_id and chunk.id in vector_score_map:
            by_id[chunk.id] = RetrievedChunk(
                chunk_id=chunk.id,
                source_id=chunk.source_id,
                source_title=chunk.source.title,
                heading=chunk.heading,
                preview=_preview(chunk.content),
                score=0,
                content=chunk.content,
            )

    rescored: list[RetrievedChunk] = []
    for chunk_id, row in by_id.items():
        vector_score = vector_score_map.get(chunk_id, 0.0)
        keyword_score = row.score
        if mode == "VECTOR":
            combined = int(vector_score * 1000)
        else:
            combined = int((vector_score * 700) + (keyword_score * 3))
        rescored.append(
            RetrievedChunk(
                chunk_id=row.chunk_id,
                source_id=row.source_id,
                source_title=row.source_title,
                heading=row.heading,
                preview=row.preview,
                score=combined,
                content=row.content,
            )
        )
    rescored.sort(key=lambda item: (-item.score, item.source_id, item.chunk_id))
    return RetrievalExecution(
        requested_mode=requested,
        actual_mode=mode,
        degraded=False,
        degraded_reason="",
        chunks=rescored[:capped_top_k],
    )
