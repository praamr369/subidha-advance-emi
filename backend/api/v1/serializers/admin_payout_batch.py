from rest_framework import serializers

from subscriptions.models import CommissionPayoutBatch, CommissionPayoutLine


class PayoutBatchPreviewQuerySerializer(serializers.Serializer):
    partner = serializers.IntegerField(required=False, min_value=1)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                {"date_to": "date_to must be on or after date_from."}
            )
        return attrs


class PayoutBatchCreateSerializer(serializers.Serializer):
    commission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    payout_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class PayoutBatchActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class PayoutBatchListSerializer(serializers.ModelSerializer):
    processed_by_username = serializers.CharField(source="processed_by.username", read_only=True)
    line_count = serializers.IntegerField(source="lines.count", read_only=True)

    class Meta:
        model = CommissionPayoutBatch
        fields = [
            "id",
            "batch_code",
            "payout_date",
            "status",
            "total_amount",
            "processed_by",
            "processed_by_username",
            "line_count",
            "created_at",
        ]


class PayoutBatchLineSerializer(serializers.ModelSerializer):
    partner_username = serializers.CharField(source="partner.username", read_only=True)
    customer_name = serializers.CharField(
        source="commission.subscription.customer.name",
        read_only=True,
        allow_null=True,
    )
    subscription_number = serializers.SerializerMethodField()
    payment_id = serializers.IntegerField(source="commission.payment_id", read_only=True)
    payment_reference_no = serializers.CharField(
        source="commission.payment.reference_no",
        read_only=True,
        allow_null=True,
    )
    commission_status = serializers.CharField(source="commission.status", read_only=True)
    settlement_date = serializers.DateField(
        source="commission.settlement_date",
        read_only=True,
        allow_null=True,
    )
    batch_code = serializers.CharField(
        source="commission.subscription.batch.batch_code",
        read_only=True,
        allow_null=True,
    )
    lucky_number = serializers.IntegerField(
        source="commission.subscription.lucky_id.lucky_number",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = CommissionPayoutLine
        fields = [
            "id",
            "commission",
            "partner",
            "partner_username",
            "customer_name",
            "subscription_number",
            "payment_id",
            "payment_reference_no",
            "commission_status",
            "settlement_date",
            "batch_code",
            "lucky_number",
            "amount",
            "created_at",
        ]

    def get_subscription_number(self, obj):
        commission = getattr(obj, "commission", None)
        if not commission or not commission.subscription_id:
            return None
        return f"SUB-{commission.subscription_id}"


class PayoutBatchDetailSerializer(serializers.ModelSerializer):
    processed_by_username = serializers.CharField(source="processed_by.username", read_only=True)
    lines = PayoutBatchLineSerializer(many=True, read_only=True)

    class Meta:
        model = CommissionPayoutBatch
        fields = [
            "id",
            "batch_code",
            "payout_date",
            "status",
            "notes",
            "total_amount",
            "processed_by",
            "processed_by_username",
            "created_at",
            "updated_at",
            "lines",
        ]
