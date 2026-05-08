from rest_framework import serializers


class OperationalCancellationActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)
    internal_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=2000)
    confirm = serializers.BooleanField(required=False, default=False)
    reversal_policy = serializers.ChoiceField(
        required=False,
        choices=["NONE", "REVERSE_RECEIPTS", "CREATE_CREDIT_NOTE", "MANUAL_SETTLEMENT"],
        default="NONE",
    )
    force_after_activation = serializers.BooleanField(required=False, default=False)

    def validate_reason(self, value):
        reason = (value or "").strip()
        if not reason:
            raise serializers.ValidationError("Cancellation reason is required.")
        return reason

    def validate(self, attrs):
        if not attrs.get("confirm"):
            raise serializers.ValidationError(
                {"confirm": "Admin confirmation is required for audited cancellation."}
            )
        return attrs


class ReversalCaseCreateSerializer(serializers.Serializer):
    source_type = serializers.CharField(required=True)
    source_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    source_reference = serializers.CharField(required=False, allow_blank=True, default="")
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    partner_id = serializers.IntegerField(required=False, allow_null=True)
    reversal_type = serializers.CharField(required=False, allow_blank=True, default="MANUAL_SETTLEMENT")
    amount_snapshot = serializers.DecimalField(required=False, max_digits=12, decimal_places=2, default=0)
    paid_amount_snapshot = serializers.DecimalField(required=False, max_digits=12, decimal_places=2, default=0)
    refundable_amount = serializers.DecimalField(required=False, max_digits=12, decimal_places=2, default=0)
    customer_credit_amount = serializers.DecimalField(required=False, max_digits=12, decimal_places=2, default=0)
    stock_return_required = serializers.BooleanField(required=False, default=False)
    delivery_return_required = serializers.BooleanField(required=False, default=False)
    accounting_reversal_required = serializers.BooleanField(required=False, default=False)
    reconciliation_required = serializers.BooleanField(required=False, default=True)
    status_before = serializers.CharField(required=False, allow_blank=True, default="")
    status_after = serializers.CharField(required=False, allow_blank=True, default="")
    settlement_mode = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)
    internal_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=2000)


class ReversalCaseTransitionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)


class ReversalCasePatchSerializer(serializers.Serializer):
    status = serializers.CharField(required=False, allow_blank=False)
    reason = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True, max_length=1000)
    internal_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=2000)


class ReversalCaseAssignSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(required=True, min_value=1)
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)


class ReversalCaseNoteSerializer(serializers.Serializer):
    note = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=2000)


class ReversalCaseCloseSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)
    override_reason = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=1000)
