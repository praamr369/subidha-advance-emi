from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class AIKnowledgeSource(models.Model):
    class SourceType(models.TextChoices):
        DOC = "DOC", "Document"
        PDF = "PDF", "PDF"
        POLICY = "POLICY", "Policy"
        FAQ = "FAQ", "FAQ"
        CONTRACT_TEMPLATE = "CONTRACT_TEMPLATE", "Contract Template"
        INTERNAL_RUNBOOK = "INTERNAL_RUNBOOK", "Internal Runbook"
        PUBLIC_PAGE = "PUBLIC_PAGE", "Public Page"
        SYSTEM_HELP = "SYSTEM_HELP", "System Help"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"
        FAILED = "FAILED", "Failed"

    class Visibility(models.TextChoices):
        ADMIN_ONLY = "ADMIN_ONLY", "Admin Only"
        STAFF = "STAFF", "Staff"
        PARTNER = "PARTNER", "Partner"
        CUSTOMER_PUBLIC = "CUSTOMER_PUBLIC", "Customer Public"
        PUBLIC = "PUBLIC", "Public"

    title = models.CharField(max_length=255)
    source_type = models.CharField(
        max_length=32,
        choices=SourceType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    visibility = models.CharField(
        max_length=24,
        choices=Visibility.choices,
        default=Visibility.ADMIN_ONLY,
        db_index=True,
    )
    owner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="owned_ai_knowledge_sources",
    )
    uploaded_file = models.FileField(
        upload_to="ai_assistant/sources/%Y/%m/",
        null=True,
        blank=True,
    )
    source_url = models.CharField(max_length=500, blank=True, default="")
    checksum = models.CharField(max_length=128, blank=True, default="", db_index=True)
    version = models.PositiveIntegerField(default=1)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_ai_knowledge_sources",
    )

    class Meta:
        db_table = "ai_knowledge_sources"
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["status", "visibility"]),
            models.Index(fields=["source_type", "status"]),
            models.Index(fields=["checksum"]),
        ]

    def save(self, *args, **kwargs):
        self.title = (self.title or "").strip()
        self.source_url = (self.source_url or "").strip()
        self.checksum = (self.checksum or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title or f"AI source {self.pk}"


class AIKnowledgeChunk(models.Model):
    source = models.ForeignKey(
        AIKnowledgeSource,
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    chunk_index = models.PositiveIntegerField()
    heading = models.CharField(max_length=255, blank=True, default="")
    content = models.TextField()
    token_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    visibility = models.CharField(
        max_length=24,
        choices=AIKnowledgeSource.Visibility.choices,
        default=AIKnowledgeSource.Visibility.ADMIN_ONLY,
        db_index=True,
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "ai_knowledge_chunks"
        ordering = ["source_id", "chunk_index", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "chunk_index"],
                name="uq_ai_chunk_per_source_index",
            ),
        ]
        indexes = [
            models.Index(fields=["source", "chunk_index"]),
            models.Index(fields=["visibility"]),
        ]

    def save(self, *args, **kwargs):
        self.heading = (self.heading or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.source_id}:{self.chunk_index}"


class AIEmbedding(models.Model):
    chunk = models.ForeignKey(
        AIKnowledgeChunk,
        on_delete=models.CASCADE,
        related_name="embeddings",
    )
    embedding = models.JSONField(
        null=True,
        blank=True,
        help_text="JSON placeholder until pgvector is introduced in a later phase.",
    )
    embedding_model = models.CharField(max_length=128, blank=True, default="")
    dimensions = models.PositiveIntegerField(default=0)
    content_hash = models.CharField(max_length=128, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "ai_embeddings"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["chunk", "embedding_model", "content_hash"],
                name="uq_ai_embedding_chunk_model_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["embedding_model"]),
            models.Index(fields=["content_hash"]),
        ]

    def save(self, *args, **kwargs):
        self.embedding_model = (self.embedding_model or "").strip()
        self.content_hash = (self.content_hash or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"AI embedding {self.pk} for chunk {self.chunk_id}"


class AIQueryLog(models.Model):
    class RetrievalMode(models.TextChoices):
        KEYWORD = "KEYWORD", "Keyword"
        VECTOR = "VECTOR", "Vector"
        HYBRID = "HYBRID", "Hybrid"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ai_query_logs",
    )
    role = models.CharField(max_length=32, blank=True, default="", db_index=True)
    query = models.TextField()
    normalized_query = models.TextField(blank=True, default="")
    retrieval_mode = models.CharField(
        max_length=16,
        choices=RetrievalMode.choices,
        default=RetrievalMode.HYBRID,
        db_index=True,
    )
    filters = models.JSONField(default=dict, blank=True)
    retrieved_chunk_ids = models.JSONField(default=list, blank=True)
    answer_preview = models.TextField(blank=True, default="")
    latency_ms = models.PositiveIntegerField(default=0)
    denied_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "ai_query_logs"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["role", "created_at"]),
            models.Index(fields=["retrieval_mode", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def save(self, *args, **kwargs):
        self.role = (self.role or "").strip().upper()
        if not self.normalized_query:
            self.normalized_query = " ".join((self.query or "").split())
        super().save(*args, **kwargs)

    def __str__(self):
        return f"AI query {self.pk}"


class AIFeedback(models.Model):
    class Rating(models.TextChoices):
        HELPFUL = "HELPFUL", "Helpful"
        NOT_HELPFUL = "NOT_HELPFUL", "Not Helpful"
        UNSAFE = "UNSAFE", "Unsafe"
        INCORRECT = "INCORRECT", "Incorrect"

    query_log = models.ForeignKey(
        AIQueryLog,
        on_delete=models.CASCADE,
        related_name="feedback",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ai_feedback",
    )
    rating = models.CharField(max_length=16, choices=Rating.choices, db_index=True)
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "ai_feedback"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["rating", "created_at"]),
        ]

    def save(self, *args, **kwargs):
        self.comment = (self.comment or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.rating} for query {self.query_log_id}"
