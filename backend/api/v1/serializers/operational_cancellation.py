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
