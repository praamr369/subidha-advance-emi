from rest_framework import serializers


class SuggestionConfirmSerializer(serializers.Serializer):
    field_key = serializers.CharField(max_length=64)
    input = serializers.CharField(max_length=255, allow_blank=True, default="")
    value = serializers.CharField(max_length=120)
    label = serializers.CharField(
        max_length=255, allow_blank=True, required=False, default=""
    )
    gst_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        default=None,
    )
