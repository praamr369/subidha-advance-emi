from rest_framework import serializers


class DryRunRunRequestSerializer(serializers.Serializer):
    checks = serializers.ListField(child=serializers.CharField(max_length=64), min_length=1)
    scopes = serializers.ListField(child=serializers.CharField(max_length=64), required=False, default=list)
    options = serializers.DictField(required=False, default=dict)

    def validate_scopes(self, value):
        for item in value:
            if not item or not item.strip():
                raise serializers.ValidationError("Scope entries must be non-empty strings.")
        return value
