from __future__ import annotations

from rest_framework import serializers

from crm.models import (
    PartyInteraction,
    PartyInteractionStatus,
    PartyInteractionType,
    PartyKind,
    PartyMaster,
)
from reminders.models import ReminderChannel


def follow_up_state_for_value(next_follow_up_at):
    if next_follow_up_at is None:
        return "NONE"
    from django.utils import timezone

    if next_follow_up_at <= timezone.now():
        return "DUE"
    return "SCHEDULED"


class PartyMasterListSerializer(serializers.ModelSerializer):
    role_types = serializers.SerializerMethodField()
    next_follow_up_at = serializers.DateTimeField(read_only=True)
    follow_up_state = serializers.SerializerMethodField()
    open_follow_up_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PartyMaster
        fields = [
            "id",
            "party_no",
            "display_name",
            "party_kind",
            "primary_phone",
            "primary_email",
            "city",
            "is_active",
            "notes_summary",
            "role_types",
            "next_follow_up_at",
            "follow_up_state",
            "open_follow_up_count",
            "created_at",
            "updated_at",
        ]

    def get_role_types(self, obj):
        links = getattr(obj, "_prefetched_objects_cache", {}).get("links")
        if links is None:
            links = obj.links.all()
        return sorted({link.role_type for link in links})

    def get_follow_up_state(self, obj):
        return follow_up_state_for_value(getattr(obj, "next_follow_up_at", None))


class PartyInteractionSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )
    reminder_no = serializers.CharField(
        source="reminder.reminder_no",
        read_only=True,
    )

    class Meta:
        model = PartyInteraction
        fields = [
            "id",
            "party",
            "interaction_type",
            "status",
            "subject",
            "note",
            "happened_at",
            "next_follow_up_at",
            "completed_at",
            "created_by",
            "created_by_username",
            "reminder",
            "reminder_no",
            "related_source_model",
            "related_source_pk",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "party",
            "completed_at",
            "created_by",
            "created_by_username",
            "reminder",
            "reminder_no",
            "created_at",
            "updated_at",
        ]


class PartyInteractionCreateSerializer(serializers.Serializer):
    interaction_type = serializers.ChoiceField(
        choices=PartyInteractionType.choices,
        required=False,
        default=PartyInteractionType.GENERAL,
    )
    status = serializers.ChoiceField(
        choices=PartyInteractionStatus.choices,
        required=False,
        default=PartyInteractionStatus.OPEN,
    )
    subject = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    happened_at = serializers.DateTimeField(required=False, allow_null=True)
    next_follow_up_at = serializers.DateTimeField(required=False, allow_null=True)
    related_source_model = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    related_source_pk = serializers.IntegerField(required=False, allow_null=True)
    create_follow_up_reminder = serializers.BooleanField(required=False, default=False)
    reminder_channel = serializers.ChoiceField(
        choices=ReminderChannel.choices,
        required=False,
        default=ReminderChannel.INTERNAL,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("create_follow_up_reminder") and attrs.get("next_follow_up_at") is None:
            raise serializers.ValidationError(
                {"next_follow_up_at": "Follow-up reminder scheduling requires next_follow_up_at."}
            )
        if attrs.get("related_source_pk") and not (attrs.get("related_source_model") or "").strip():
            raise serializers.ValidationError(
                {"related_source_model": "Related source model is required when related source id is set."}
            )
        return attrs


class PartyInteractionStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PartyInteractionStatus.choices)


class PartyMasterUpdateSerializer(serializers.Serializer):
    display_name = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    party_kind = serializers.ChoiceField(choices=PartyKind.choices, required=False)
    primary_phone = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    primary_email = serializers.EmailField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    notes_summary = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    is_active = serializers.BooleanField(required=False)
