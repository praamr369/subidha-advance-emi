from __future__ import annotations

from rest_framework import serializers

from system_jobs.models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    severity = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    read_at = serializers.DateTimeField(read_only=True)

    def get_category(self, obj: Notification) -> str:
        category = obj.payload.get("category")
        if isinstance(category, str) and category.strip():
            return category.strip().upper()
        module = (obj.module or "").strip().upper()
        return module or "GENERAL"

    def get_severity(self, obj: Notification) -> str:
        severity = obj.payload.get("severity")
        if isinstance(severity, str) and severity.strip():
            return severity.strip().upper()
        return "INFO"

    def get_is_read(self, obj: Notification) -> bool:
        return obj.read_at is not None

    class Meta:
        model = Notification
        fields = (
            "id",
            "module",
            "category",
            "severity",
            "title",
            "body",
            "payload",
            "is_read",
            "read_at",
            "created_at",
            "source_job_id",
        )
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ("id", "module", "enabled", "updated_at")
        read_only_fields = ("id", "updated_at")
