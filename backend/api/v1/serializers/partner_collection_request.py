from rest_framework import serializers

from subscriptions.models import PartnerCollectionRequest


class PartnerCollectionRequestSerializer(serializers.ModelSerializer):
    subscription_id = serializers.IntegerField(source="subscription.id", read_only=True)
    subscription_number = serializers.SerializerMethodField()

    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    partner_username = serializers.CharField(source="partner.username", read_only=True)
    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
    )

    approved_payment_id = serializers.IntegerField(
        source="approved_payment.id",
        read_only=True,
    )
    approved_emi_id = serializers.IntegerField(
        source="approved_emi.id",
        read_only=True,
    )

    method = serializers.CharField(source="payment_method", read_only=True)
    submitted_at = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = PartnerCollectionRequest
        fields = (
            "id",
            "partner",
            "partner_username",
            "subscription",
            "subscription_id",
            "subscription_number",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "amount",
            "payment_method",
            "method",
            "payment_date",
            "reference_no",
            "notes",
            "status",
            "submitted_at",
            "reviewed_by",
            "reviewed_by_username",
            "reviewed_at",
            "review_note",
            "approved_payment_id",
            "approved_emi_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        return f"SUB-{obj.subscription_id}"


class PartnerCollectionRequestCreateSerializer(serializers.Serializer):
    subscription = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_mode = serializers.CharField(max_length=10)
    payment_date = serializers.DateField(required=False)
    paid_at = serializers.DateField(required=False)
    reference_no = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    def validate(self, attrs):
        payment_date = attrs.get("payment_date") or attrs.get("paid_at")
        if not payment_date:
            raise serializers.ValidationError(
                {"payment_date": "Payment date is required."}
            )

        attrs["payment_date"] = payment_date
        attrs["payment_method"] = attrs.get("payment_mode")
        return attrs


class PartnerCollectionRequestDecisionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def get_note(self):
        validated = getattr(self, "validated_data", {})
        return (validated.get("note") or validated.get("reason") or "").strip()