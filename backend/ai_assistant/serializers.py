from rest_framework import serializers

from ai_assistant.models import (
    AIFeedback,
    AIKnowledgeChunk,
    AIKnowledgeSource,
    AIQueryLog,
)


class AIKnowledgeSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIKnowledgeSource
        fields = (
            "id",
            "title",
            "source_type",
            "status",
            "visibility",
            "source_url",
            "checksum",
            "version",
            "metadata",
            "created_at",
            "updated_at",
            "created_by",
            "owner_user",
        )
        read_only_fields = (
            "id",
            "status",
            "checksum",
            "created_at",
            "updated_at",
            "created_by",
        )


class AIKnowledgeChunkSerializer(serializers.ModelSerializer):
    source_id = serializers.IntegerField(read_only=True)
    content_preview = serializers.SerializerMethodField()

    class Meta:
        model = AIKnowledgeChunk
        fields = (
            "id",
            "source_id",
            "chunk_index",
            "heading",
            "content_preview",
            "token_count",
            "visibility",
            "created_at",
        )

    def get_content_preview(self, obj):
        content = " ".join((obj.content or "").split())
        return content[:240]


class AIQueryRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=3, max_length=1000, trim_whitespace=True)
    scope = serializers.ChoiceField(choices=["INTERNAL_DOCS"], default="INTERNAL_DOCS")
    top_k = serializers.IntegerField(min_value=1, max_value=10, required=False)


class AIQueryLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIQueryLog
        fields = (
            "id",
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
        read_only_fields = fields


class AIFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIFeedback
        fields = ("id", "query_log", "user", "rating", "comment", "created_at")
        read_only_fields = ("id", "user", "created_at")
