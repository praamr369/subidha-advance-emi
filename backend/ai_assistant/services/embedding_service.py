from __future__ import annotations

import hashlib
import math
from typing import Iterable

from django.conf import settings
from django.db import transaction

from ai_assistant.models import AIEmbedding, AIKnowledgeChunk, AIKnowledgeSource


def embeddings_enabled() -> bool:
    return bool(getattr(settings, "AI_EMBEDDINGS_ENABLED", False))


def vector_search_enabled() -> bool:
    return bool(getattr(settings, "AI_VECTOR_SEARCH_ENABLED", False)) and embeddings_enabled()


def _provider() -> str:
    return (getattr(settings, "AI_EMBEDDING_PROVIDER", "") or "").strip().upper()


def _model() -> str:
    value = (getattr(settings, "AI_EMBEDDING_MODEL", "") or "").strip()
    if value:
        return value
    return "mock-hash-v1"


def _dimensions() -> int:
    return max(8, int(getattr(settings, "AI_EMBEDDING_DIMENSIONS", 1536) or 1536))


def _hash_content(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _mock_embedding(text: str, *, dims: int) -> list[float]:
    digest = hashlib.sha256((text or "").encode("utf-8")).digest()
    numbers = [digest[i % len(digest)] / 255.0 for i in range(dims)]
    norm = math.sqrt(sum(value * value for value in numbers)) or 1.0
    return [value / norm for value in numbers]


def embed_text(text: str) -> dict:
    if not embeddings_enabled():
        return {"enabled": False, "embedded": False, "reason": "EMBEDDINGS_DISABLED"}
    if not text or not text.strip():
        return {"enabled": True, "embedded": False, "reason": "EMPTY_TEXT"}

    provider = _provider()
    if not provider:
        return {"enabled": True, "embedded": False, "reason": "MISSING_PROVIDER"}

    dims = _dimensions()
    # Phase 8G: deterministic local embedding path only.
    vector = _mock_embedding(text, dims=dims)
    return {
        "enabled": True,
        "embedded": True,
        "embedding": vector,
        "model": _model(),
        "dimensions": dims,
        "provider": provider,
    }


def embed_chunk(chunk: AIKnowledgeChunk) -> dict:
    from ai_assistant.services.ingestion_service import content_is_blocked_by_policy

    if content_is_blocked_by_policy(chunk.content):
        return {"embedded": False, "skipped": True, "reason": "BLOCKED_CONTENT", "chunk_id": chunk.id}

    content_hash = _hash_content(chunk.content)
    model = _model()
    if AIEmbedding.objects.filter(chunk=chunk, embedding_model=model, content_hash=content_hash).exists():
        return {"embedded": False, "skipped": True, "reason": "UNCHANGED_CONTENT", "chunk_id": chunk.id}

    payload = embed_text(chunk.content)
    if not payload.get("embedded"):
        return {
            "embedded": False,
            "skipped": True,
            "reason": payload.get("reason") or "EMBEDDING_UNAVAILABLE",
            "chunk_id": chunk.id,
        }

    AIEmbedding.objects.create(
        chunk=chunk,
        embedding=payload["embedding"],
        embedding_model=payload["model"],
        dimensions=payload["dimensions"],
        content_hash=content_hash,
    )
    return {"embedded": True, "skipped": False, "chunk_id": chunk.id}


def embed_source(source: AIKnowledgeSource) -> dict:
    chunks = list(source.chunks.all().order_by("chunk_index", "id"))
    if not chunks:
        return {"embedded_count": 0, "skipped_count": 0, "status": "PENDING"}

    embedded_count = 0
    skipped_count = 0
    failed_count = 0

    with transaction.atomic():
        for chunk in chunks:
            result = embed_chunk(chunk)
            if result.get("embedded"):
                embedded_count += 1
            elif result.get("reason") in {"UNCHANGED_CONTENT", "BLOCKED_CONTENT", "MISSING_PROVIDER", "EMBEDDINGS_DISABLED"}:
                skipped_count += 1
            else:
                failed_count += 1

    status = "EMBEDDED" if embedded_count > 0 and failed_count == 0 else "FAILED" if failed_count > 0 else "PENDING"
    return {
        "embedded_count": embedded_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "status": status,
    }


def rebuild_embeddings(source_id: int | None = None) -> dict:
    queryset = AIKnowledgeSource.objects.filter(status=AIKnowledgeSource.Status.ACTIVE).order_by("id")
    if source_id:
        queryset = queryset.filter(id=source_id)

    sources_processed = 0
    embedded_chunks = 0
    skipped_chunks = 0
    for source in queryset:
        result = embed_source(source)
        sources_processed += 1
        embedded_chunks += int(result.get("embedded_count") or 0)
        skipped_chunks += int(result.get("skipped_count") or 0)
    return {
        "sources_processed": sources_processed,
        "embedded_chunks": embedded_chunks,
        "skipped_chunks": skipped_chunks,
    }


def vector_candidates_for_chunks(chunks: Iterable[AIKnowledgeChunk], *, query_embedding: list[float], top_k: int) -> list[dict]:
    chunk_ids = [chunk.id for chunk in chunks]
    if not chunk_ids:
        return []
    embeddings = (
        AIEmbedding.objects.filter(chunk_id__in=chunk_ids, embedding_model=_model())
        .order_by("chunk_id", "-created_at")
    )
    latest_by_chunk: dict[int, AIEmbedding] = {}
    for row in embeddings:
        if row.chunk_id not in latest_by_chunk:
            latest_by_chunk[row.chunk_id] = row

    def cosine(a: list[float], b: list[float]) -> float:
        if not a or not b or len(a) != len(b):
            return -1.0
        return sum(x * y for x, y in zip(a, b))

    scored = []
    for chunk in chunks:
        row = latest_by_chunk.get(chunk.id)
        if not row or not isinstance(row.embedding, list):
            continue
        value = cosine(query_embedding, row.embedding)
        if value < 0:
            continue
        scored.append({"chunk_id": chunk.id, "score": value})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]
