from rest_framework import serializers

from subscriptions.models import ContractAmendment, Subscription
from subscriptions.models_contract_amendment import PHASE1_AMENDMENT_TYPES, PHASE1_STATUSES


class ContractAmendmentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    subscription_number = serializers.CharField(source="subscription.subscription_number", read_only=True)
    rent_lease_contract_number = serializers.CharField(source="rent_lease_contract.subscription_number", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    implemented_by_username = serializers.CharField(source="implemented_by.username", read_only=True)

    class Meta:
        model = ContractAmendment
        fields = [
            "id",
            "amendment_no",
            "contract_type",
            "subscription",
            "subscription_number",
            "rent_lease_contract",
            "rent_lease_contract_number",
            "customer",
            "customer_name",
            "customer_phone",
            "partner",
            "requested_by",
            "requested_by_username",
            "requested_role",
            "amendment_type",
            "status",
            "old_values",
            "requested_values",
            "approved_values",
            "implemented_values",
            "previous_values",
            "new_values",
            "reason",
            "admin_note",
            "rejection_reason",
            "financial_impact_amount",
            "requires_emi_recalculation",
            "requires_inventory_review",
            "requires_lucky_id_review",
            "requires_accounting_review",
            "requires_rent_lease_review",
            "effective_date",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "implemented_by",
            "implemented_by_username",
            "implemented_at",
            "applied_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ContractAmendmentCreateSerializer(serializers.Serializer):
    contract_type = serializers.ChoiceField(choices=["EMI_SUBSCRIPTION", "RENT_LEASE"])
    subscription = serializers.PrimaryKeyRelatedField(queryset=Subscription.objects.all(), required=False, allow_null=True)
    rent_lease_contract = serializers.PrimaryKeyRelatedField(queryset=Subscription.objects.all(), required=False, allow_null=True)
    amendment_type = serializers.ChoiceField(choices=sorted(PHASE1_AMENDMENT_TYPES))
    requested_values = serializers.JSONField(required=False, default=dict)
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    effective_date = serializers.DateField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        has_subscription = bool(attrs.get("subscription"))
        has_rent_lease = bool(attrs.get("rent_lease_contract"))
        if has_subscription == has_rent_lease:
            raise serializers.ValidationError({"source": "Exactly one contract source is required."})
        if attrs["contract_type"] == "EMI_SUBSCRIPTION" and not has_subscription:
            raise serializers.ValidationError({"subscription": "EMI subscription source is required."})
        if attrs["contract_type"] == "RENT_LEASE" and not has_rent_lease:
            raise serializers.ValidationError({"rent_lease_contract": "Rent/lease contract source is required."})
        return attrs


class ContractAmendmentReviewSerializer(serializers.Serializer):
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentApproveSerializer(serializers.Serializer):
    approved_values = serializers.JSONField(required=False)
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(allow_blank=False, trim_whitespace=True)
    admin_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ContractAmendmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=sorted(PHASE1_STATUSES), required=False)
