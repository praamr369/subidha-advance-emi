from django.contrib import admin

from ai_assistant.models import (
    AIFeedback,
    AIEmbedding,
    AIKnowledgeChunk,
    AIKnowledgeSource,
    AIQueryLog,
)


class NoBulkActionsAdmin(admin.ModelAdmin):
    actions = None


@admin.register(AIKnowledgeSource)
class AIKnowledgeSourceAdmin(NoBulkActionsAdmin):
    list_display = ("id", "title", "source_type", "status", "visibility", "version", "updated_at")
    list_filter = ("source_type", "status", "visibility")
    search_fields = ("title", "source_url", "checksum")
    readonly_fields = ("checksum", "created_at", "updated_at")


@admin.register(AIKnowledgeChunk)
class AIKnowledgeChunkAdmin(NoBulkActionsAdmin):
    list_display = ("id", "source", "chunk_index", "heading", "visibility", "token_count", "created_at")
    list_filter = ("visibility", "created_at")
    search_fields = ("heading", "content", "source__title")
    readonly_fields = ("created_at",)


@admin.register(AIEmbedding)
class AIEmbeddingAdmin(NoBulkActionsAdmin):
    list_display = ("id", "chunk", "embedding_model", "dimensions", "content_hash", "created_at")
    list_filter = ("embedding_model", "created_at")
    search_fields = ("embedding_model", "content_hash", "chunk__heading")
    readonly_fields = ("chunk", "embedding", "embedding_model", "dimensions", "content_hash", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AIQueryLog)
class AIQueryLogAdmin(NoBulkActionsAdmin):
    list_display = ("id", "user", "role", "retrieval_mode", "latency_ms", "denied_reason", "created_at")
    list_filter = ("role", "retrieval_mode", "created_at")
    search_fields = ("query", "normalized_query", "answer_preview", "denied_reason", "user__username")
    readonly_fields = (
        "user",
        "role",
        "query",
        "normalized_query",
        "retrieval_mode",
        "filters",
        "retrieved_chunk_ids",
        "answer_preview",
        "latency_ms",
        "denied_reason",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AIFeedback)
class AIFeedbackAdmin(NoBulkActionsAdmin):
    list_display = ("id", "query_log", "user", "rating", "created_at")
    list_filter = ("rating", "created_at")
    search_fields = ("comment", "user__username")
    readonly_fields = ("query_log", "user", "rating", "comment", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
