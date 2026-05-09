from __future__ import annotations

from rest_framework import serializers

from crm.models import FollowUpTask, Lead, LeadStage


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "address",
            "source",
            "interested_product",
            "interested_plan_type",
            "stage",
            "assigned_to",
            "next_follow_up_at",
            "converted_customer",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class LeadStageUpdateSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=LeadStage.choices)


class LeadConvertSerializer(serializers.Serializer):
    create_customer = serializers.BooleanField(required=False, default=True)
    name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)


class FollowUpTaskSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = FollowUpTask
        fields = [
            "id",
            "lead",
            "customer",
            "assigned_to",
            "due_at",
            "status",
            "call_note",
            "completed_at",
            "is_overdue",
            "created_at",
        ]
        read_only_fields = ["id", "completed_at", "created_at", "is_overdue"]

    def get_is_overdue(self, obj):
        from django.utils import timezone

        return obj.status == "OPEN" and obj.due_at <= timezone.now()

