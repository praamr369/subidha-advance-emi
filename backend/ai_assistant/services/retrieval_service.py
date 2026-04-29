from __future__ import annotations

import re
from dataclasses import dataclass

from django.db.models import Q

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
    del scope
    normalized_query = " ".join((query or "").split())
    keywords = _tokens(normalized_query)
    if not normalized_query or not keywords:
        return []

    queryset = phase_8d_chunk_queryset(user)
    text_filter = Q()
    for keyword in keywords[:8]:
        text_filter |= Q(content__icontains=keyword)
        text_filter |= Q(heading__icontains=keyword)
        text_filter |= Q(source__title__icontains=keyword)

    if text_filter:
        queryset = queryset.filter(text_filter)

    scored: list[RetrievedChunk] = []
    for chunk in queryset.order_by("source_id", "chunk_index", "id")[:500]:
        if content_is_blocked_by_policy(chunk.content):
            continue
        score = _score_chunk(query=normalized_query, keywords=keywords, chunk=chunk)
        if score <= 0:
            continue
        scored.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                source_id=chunk.source_id,
                source_title=chunk.source.title,
                heading=chunk.heading,
                preview=_preview(chunk.content),
                score=score,
                content=chunk.content,
            )
        )

    scored.sort(key=lambda item: (-item.score, item.source_id, item.chunk_id))
    return scored[: max(1, min(int(top_k or 5), 10))]
