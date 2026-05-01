from __future__ import annotations

from rest_framework import serializers

from system_jobs.models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "recipient",
            "audience",
            "module",
            "title",
            "body",
            "payload",
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
