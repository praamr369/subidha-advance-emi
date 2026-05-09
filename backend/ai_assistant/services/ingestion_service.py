from __future__ import annotations

import hashlib
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ai_assistant.models import AIKnowledgeChunk, AIKnowledgeSource
from ai_assistant.services.chunking_service import AIChunkingError, chunk_source_text
from ai_assistant.services.embedding_service import embed_source, embeddings_enabled


ALLOWED_SOURCE_TYPES = {
    AIKnowledgeSource.SourceType.INTERNAL_RUNBOOK,
    AIKnowledgeSource.SourceType.POLICY,
    AIKnowledgeSource.SourceType.FAQ,
    AIKnowledgeSource.SourceType.SYSTEM_HELP,
    AIKnowledgeSource.SourceType.PUBLIC_PAGE,
}
ALLOWED_STATUSES = {AIKnowledgeSource.Status.DRAFT, AIKnowledgeSource.Status.ACTIVE}
ALLOWED_FILE_EXTENSIONS = {".txt", ".md"}
BLOCKED_FILENAME_TOKENS = [
    ".env",
    "secret",
    "token",
    "key",
    "credential",
    "backup",
    "dump",
    "customer_export",
    "customers_export",
    "customer-data",
    "customer_data",
    "kyc",
    "ledger",
    "payment_ledger",
    "payments_ledger",
]
BLOCKED_CONTENT_PATTERNS = [
    "SECRET_KEY=",
    "JWT_SIGNING_KEY=",
    "DATABASE_URL=",
    "API_KEY=",
    "BEGIN PRIVATE KEY",
]


class AIIngestionError(ValueError):
    pass


def _contains_blocked_filename(name: str) -> bool:
    lowered = (name or "").lower()
    return any(token in lowered for token in BLOCKED_FILENAME_TOKENS)


def _contains_blocked_content(content: str) -> bool:
    upper_content = (content or "").upper()
    return any(pattern in upper_content for pattern in BLOCKED_CONTENT_PATTERNS)


def content_is_blocked_by_policy(content: str) -> bool:
    return _contains_blocked_content(content)


def validate_source_payload(*, filename: str | None, content_text: str | None) -> None:
    if filename and _contains_blocked_filename(filename):
        raise AIIngestionError("Source file name is blocked by ingestion safety policy.")
    if content_text and _contains_blocked_content(content_text):
        raise AIIngestionError("Source content is blocked by ingestion safety policy.")


def _read_source_content(source: AIKnowledgeSource) -> tuple[str, str]:
    if source.uploaded_file:
        filename = Path(source.uploaded_file.name or "").name
        extension = Path(filename).suffix.lower()
        if extension not in ALLOWED_FILE_EXTENSIONS:
            raise AIIngestionError("Only .txt and .md files are allowed in Phase 8C ingestion.")
        if _contains_blocked_filename(filename):
            raise AIIngestionError("Source file name is blocked by ingestion safety policy.")
        raw = source.uploaded_file.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AIIngestionError("Uploaded file must be valid UTF-8 text content.") from exc
        source.uploaded_file.seek(0)
        return text, filename

    if source.source_url and _contains_blocked_filename(source.source_url):
        raise AIIngestionError("Source file name is blocked by ingestion safety policy.")

    inline_text = source.content_text or ""
    if inline_text.strip():
        return inline_text, source.source_url or ""

    raise AIIngestionError("Source has no ingestible text content.")


def ingest_source(*, source: AIKnowledgeSource) -> dict:
    if not getattr(settings, "AI_ASSISTANT_ENABLED", False):
        raise AIIngestionError("AI assistant is disabled.")
    if source.source_type not in ALLOWED_SOURCE_TYPES:
        raise AIIngestionError("Source type is not allowed for Phase 8C ingestion.")
    if source.status not in ALLOWED_STATUSES:
        raise AIIngestionError("Only DRAFT or ACTIVE sources can be ingested.")
    if source.visibility != AIKnowledgeSource.Visibility.ADMIN_ONLY:
        raise AIIngestionError("Only ADMIN_ONLY sources can be ingested in Phase 8C.")

    started_at = timezone.now()
    metadata = dict(source.metadata or {})
    metadata["ingestion_started_at"] = started_at.isoformat()

    try:
        content, filename = _read_source_content(source)
        validate_source_payload(filename=filename, content_text=content)
        normalized_content = content.strip()
        if not normalized_content:
            raise AIIngestionError("Source content is empty.")

        checksum = hashlib.sha256(normalized_content.encode("utf-8")).hexdigest()
        chunks = chunk_source_text(normalized_content, max_chars=1800, overlap_chars=200)

        now = timezone.now()
        completed_at = timezone.now()
        metadata.update(
            {
                "chunk_count": len(chunks),
                "checksum": checksum,
                "ingestion_completed_at": completed_at.isoformat(),
                "ingestion_error": "",
                "embedding_status": "NOT_ENABLED",
                "embedded_chunk_count": 0,
            }
        )
        source.checksum = checksum
        source.status = AIKnowledgeSource.Status.ACTIVE
        source.metadata = metadata

        with transaction.atomic():
            source.chunks.filter(metadata__source_version=source.version).delete()
            AIKnowledgeChunk.objects.bulk_create(
                [
                    AIKnowledgeChunk(
                        source=source,
                        chunk_index=item.chunk_index,
                        heading=item.heading,
                        content=item.content,
                        token_count=item.token_count,
                        visibility=source.visibility,
                        metadata={
                            "source_version": source.version,
                            "source_checksum": checksum,
                            "ingested_at": now.isoformat(),
                        },
                    )
                    for item in chunks
                ]
            )
            if embeddings_enabled():
                metadata["embedding_status"] = "PENDING"
            source.save(update_fields=["checksum", "status", "metadata", "updated_at"])

        if embeddings_enabled():
            embedding_result = embed_source(source)
            metadata = dict(source.metadata or {})
            metadata["embedding_status"] = embedding_result.get("status") or "PENDING"
            metadata["embedded_chunk_count"] = int(embedding_result.get("embedded_count") or 0)
            metadata["embedding_skipped_chunk_count"] = int(embedding_result.get("skipped_count") or 0)
            metadata["embedding_failed_chunk_count"] = int(embedding_result.get("failed_count") or 0)
            source.metadata = metadata
            source.save(update_fields=["metadata", "updated_at"])

        return {
            "source_id": source.id,
            "status": source.status,
            "chunk_count": len(chunks),
            "checksum": checksum,
            "embedding_status": (source.metadata or {}).get("embedding_status", "NOT_ENABLED"),
        }
    except (AIIngestionError, AIChunkingError) as exc:
        completed_at = timezone.now()
        metadata.update(
            {
                "chunk_count": 0,
                "ingestion_completed_at": completed_at.isoformat(),
                "ingestion_error": str(exc),
            }
        )
        source.status = AIKnowledgeSource.Status.FAILED
        source.metadata = metadata
        source.save(update_fields=["status", "metadata", "updated_at"])
        raise AIIngestionError(str(exc)) from exc
