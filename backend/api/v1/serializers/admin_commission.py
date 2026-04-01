from rest_framework import serializers

from subscriptions.models import Commission, CommissionStatus


class _DateRangeValidationMixin:
    def validate(self, attrs):
        attrs = super().validate(attrs)
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                {"date_to": "date_to must be on or after date_from."}
            )
        return attrs


class CommissionReportFilterSerializer(
    _DateRangeValidationMixin,
    serializers.Serializer,
):
    partner = serializers.IntegerField(required=False, min_value=1)
    status = serializers.ChoiceField(
        required=False,
        choices=CommissionStatus.choices,
    )
    subscription = serializers.IntegerField(required=False, min_value=1)
    payment = serializers.IntegerField(required=False, min_value=1)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


class CommissionStatementExportSerializer(
    _DateRangeValidationMixin,
    serializers.Serializer,
):
    partner = serializers.IntegerField(required=False, min_value=1)
    status = serializers.ChoiceField(
        required=False,
        choices=CommissionStatus.choices,
    )
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    export_format = serializers.ChoiceField(choices=["csv", "pdf"], default="csv")


class CommissionSettleSerializer(serializers.Serializer):
    settlement_date = serializers.DateField(required=False)


class CommissionListSerializer(serializers.ModelSerializer):
    partner_username = serializers.CharField(source="partner.username", read_only=True)
    partner_phone = serializers.CharField(source="partner.phone", read_only=True)
    customer_name = serializers.CharField(
        source="subscription.customer.name",
        read_only=True,
        allow_null=True,
    )
    customer_phone = serializers.CharField(
        source="subscription.customer.phone",
        read_only=True,
        allow_null=True,
    )
    subscription_number = serializers.SerializerMethodField()
    batch_code = serializers.CharField(
        source="subscription.batch.batch_code",
        read_only=True,
        allow_null=True,
    )
    lucky_number = serializers.IntegerField(
        source="subscription.lucky_id.lucky_number",
        read_only=True,
        allow_null=True,
    )
    payment_amount = serializers.DecimalField(
        source="payment.amount",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    payment_date = serializers.DateField(
        source="payment.payment_date",
        read_only=True,
        allow_null=True,
    )
    payment_reference_no = serializers.CharField(
        source="payment.reference_no",
        read_only=True,
        allow_null=True,
    )
    payment_method = serializers.CharField(
        source="payment.method",
        read_only=True,
        allow_null=True,
    )
    emi_month_no = serializers.IntegerField(
        source="emi.month_no",
        read_only=True,
        allow_null=True,
    )
    payout_batch_id = serializers.SerializerMethodField()
    payout_batch_code = serializers.SerializerMethodField()
    payout_batch_status = serializers.SerializerMethodField()

    class Meta:
        model = Commission
        fields = [
            "id",
            "partner",
            "partner_username",
            "partner_phone",
            "subscription",
            "subscription_number",
            "customer_name",
            "customer_phone",
            "batch_code",
            "lucky_number",
            "payment",
            "payment_amount",
            "payment_date",
            "payment_reference_no",
            "payment_method",
            "emi",
            "emi_month_no",
            "commission_rate",
            "commission_amount",
            "status",
            "settlement_date",
            "payout_batch_id",
            "payout_batch_code",
            "payout_batch_status",
            "reversal_reason",
            "created_at",
            "updated_at",
        ]

    def get_subscription_number(self, obj):
        if not obj.subscription_id:
            return None
        return f"SUB-{obj.subscription_id}"

    def get_payout_batch_id(self, obj):
        payout_line = getattr(obj, "payout_line", None)
        if payout_line is None:
            return None
        return payout_line.payout_batch_id

    def get_payout_batch_code(self, obj):
        payout_line = getattr(obj, "payout_line", None)
        if payout_line is None or payout_line.payout_batch is None:
            return None
        return payout_line.payout_batch.batch_code

    def get_payout_batch_status(self, obj):
        payout_line = getattr(obj, "payout_line", None)
        if payout_line is None or payout_line.payout_batch is None:
            return None
        return payout_line.payout_batch.status


class CommissionPartnerSummarySerializer(serializers.Serializer):
    partner_id = serializers.IntegerField()
    partner_username = serializers.CharField()
    total_commission = serializers.CharField()
    pending_commission = serializers.CharField()
    settled_commission = serializers.CharField()
    reversed_commission = serializers.CharField()
    commission_count = serializers.IntegerField()

class CommissionBulkSettleSerializer(serializers.Serializer):
    commission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    settlement_date = serializers.DateField(required=False)
