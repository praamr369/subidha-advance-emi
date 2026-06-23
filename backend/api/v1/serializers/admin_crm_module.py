from __future__ import annotations

from rest_framework import serializers

from crm.models import FollowUpTask, Lead, LeadSource, LeadStage, Opportunity, OpportunityStage


class LeadSerializer(serializers.ModelSerializer):
    assigned_to_username = serializers.CharField(source="assigned_to.username", read_only=True, default=None)
    assigned_to_full_name = serializers.SerializerMethodField()
    converted_customer_name = serializers.CharField(source="converted_customer.name", read_only=True, default=None)
    product_name = serializers.CharField(source="interested_product.name", read_only=True, default=None)

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
            "product_name",
            "interested_plan_type",
            "stage",
            "assigned_to",
            "assigned_to_username",
            "assigned_to_full_name",
            "next_follow_up_at",
            "converted_customer",
            "converted_customer_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "assigned_to_username",
            "assigned_to_full_name",
            "converted_customer_name",
            "product_name",
            "created_at",
            "updated_at",
        ]

    def get_assigned_to_full_name(self, obj):
        user = obj.assigned_to
        if user is None:
            return None
        full = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full or user.username


class LeadUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    phone = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    source = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    interested_product = serializers.IntegerField(required=False, allow_null=True)
    interested_plan_type = serializers.ChoiceField(
        choices=["LUCKY_PLAN", "RENT", "LEASE", "DIRECT_SALE"],
        required=False,
    )
    next_follow_up_at = serializers.DateTimeField(required=False, allow_null=True)


class LeadStageUpdateSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=LeadStage.choices)


class LeadAssignSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField(allow_null=True)


class LeadConvertSerializer(serializers.Serializer):
    create_customer = serializers.BooleanField(required=False, default=True)
    name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)


class FollowUpTaskSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()
    lead_name = serializers.CharField(source="lead.name", read_only=True, default=None)
    assigned_to_username = serializers.CharField(source="assigned_to.username", read_only=True, default=None)

    class Meta:
        model = FollowUpTask
        fields = [
            "id",
            "lead",
            "lead_name",
            "customer",
            "assigned_to",
            "assigned_to_username",
            "due_at",
            "status",
            "call_note",
            "completed_at",
            "is_overdue",
            "created_at",
        ]
        read_only_fields = ["id", "completed_at", "created_at", "is_overdue", "lead_name", "assigned_to_username"]

    def get_is_overdue(self, obj):
        from django.utils import timezone
        return obj.status == "OPEN" and obj.due_at <= timezone.now()


class FollowUpTaskCreateSerializer(serializers.Serializer):
    due_at = serializers.DateTimeField()
    call_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    customer = serializers.IntegerField(required=False, allow_null=True)


class OpportunitySerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source="owner.username", read_only=True, default=None)

    class Meta:
        model = Opportunity
        fields = [
            "id",
            "lead",
            "customer",
            "title",
            "estimated_value",
            "stage",
            "expected_close_date",
            "owner",
            "owner_username",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "lead", "owner_username", "created_at", "updated_at"]


class OpportunityCreateSerializer(serializers.Serializer):
    title = serializers.CharField(trim_whitespace=True)
    estimated_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    owner = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    customer = serializers.IntegerField(required=False, allow_null=True)


class OpportunityStageUpdateSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=OpportunityStage.choices)
    notes = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
