from rest_framework import serializers

from ai_assistant.models import (
    AIFeedback,
    AIKnowledgeChunk,
    AIKnowledgeSource,
    AIQueryLog,
)
from ai_assistant.services.ingestion_service import (
    ALLOWED_SOURCE_TYPES,
    AIIngestionError,
    validate_source_payload,
)


class AIKnowledgeSourceSerializer(serializers.ModelSerializer):
    has_inline_content = serializers.SerializerMethodField()

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
            "has_inline_content",
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

    def get_has_inline_content(self, obj):
        return bool((obj.content_text or "").strip())


class AIKnowledgeSourceCreateSerializer(serializers.ModelSerializer):
    content_text = serializers.CharField(required=False, allow_blank=True)
    uploaded_file = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = AIKnowledgeSource
        fields = (
            "id",
            "title",
            "source_type",
            "status",
            "visibility",
            "source_url",
            "uploaded_file",
            "content_text",
            "owner_user",
            "metadata",
        )
        read_only_fields = ("id",)

    def validate_source_type(self, value):
        if value not in ALLOWED_SOURCE_TYPES:
            raise serializers.ValidationError("Source type is not allowed in Phase 8C.")
        return value

    def validate_status(self, value):
        if value not in {AIKnowledgeSource.Status.DRAFT, AIKnowledgeSource.Status.ACTIVE}:
            raise serializers.ValidationError("Status must be DRAFT or ACTIVE for ingestion-ready sources.")
        return value

    def validate_visibility(self, value):
        if value != AIKnowledgeSource.Visibility.ADMIN_ONLY:
            raise serializers.ValidationError("Phase 8C only supports ADMIN_ONLY visibility.")
        return value

    def validate(self, attrs):
        upload = attrs.get("uploaded_file")
        source_url = attrs.get("source_url", "")
        content_text = attrs.get("content_text", "")
        filename = upload.name if upload else None
        upload_text = ""
        if upload:
            extension = (filename or "").lower()
            if not (extension.endswith(".txt") or extension.endswith(".md")):
                raise serializers.ValidationError({"uploaded_file": "Only .txt and .md files are allowed in Phase 8C."})
            raw = upload.read()
            try:
                upload_text = raw.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise serializers.ValidationError({"uploaded_file": "Uploaded file must be valid UTF-8 text content."}) from exc
            finally:
                upload.seek(0)
        try:
            validate_source_payload(filename=filename or source_url, content_text=content_text)
            if upload_text:
                validate_source_payload(filename=filename, content_text=upload_text)
        except AIIngestionError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        if not upload and not (content_text or "").strip():
            raise serializers.ValidationError({"content_text": "Provide markdown/text content or an uploaded .txt/.md file."})
        return attrs


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
    retrieval_mode = serializers.ChoiceField(
        choices=["AUTO", "KEYWORD", "VECTOR", "HYBRID"],
        default="AUTO",
        required=False,
    )


class AIBIExplainRequestSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(
        choices=[
            "ADMIN_DASHBOARD",
            "BI_CONTROL_CENTER",
            "FINANCE",
            "INVENTORY",
            "DELIVERY",
            "HR",
            "SUBSCRIPTIONS",
            "CRM",
            "PARTNER",
            "ADMIN_BI",
        ],
        default="ADMIN_BI",
    )
    window = serializers.ChoiceField(
        choices=["TODAY", "THIS_WEEK", "THIS_MONTH", "LAST_MONTH"],
        default="THIS_MONTH",
    )


class AIQueryLogSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    feedback_status = serializers.SerializerMethodField()

    class Meta:
        model = AIQueryLog
        fields = (
            "id",
            "user",
            "user_display",
            "role",
            "query",
            "normalized_query",
            "retrieval_mode",
            "requested_retrieval_mode",
            "degraded",
            "degraded_reason",
            "filters",
            "retrieved_chunk_ids",
            "answer_preview",
            "latency_ms",
            "denied_reason",
            "feedback_status",
            "created_at",
        )
        read_only_fields = fields

    def get_user_display(self, obj):
        user = getattr(obj, "user", None)
        if not user:
            return ""
        return getattr(user, "username", "") or getattr(user, "phone", "") or str(user.pk)

    def get_feedback_status(self, obj):
        feedback_rows = list(getattr(obj, "feedback", []).all())
        if not feedback_rows:
            return ""
        return feedback_rows[0].rating


class AIFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIFeedback
        fields = ("id", "query_log", "user", "rating", "comment", "created_at")
        read_only_fields = ("id", "user", "created_at")

    def validate_query_log(self, value):
        role = (getattr(value, "role", "") or "").strip().upper()
        if role and role != "ADMIN":
            raise serializers.ValidationError("Feedback is limited to accessible admin AI queries in Phase 8D.")
        return value
