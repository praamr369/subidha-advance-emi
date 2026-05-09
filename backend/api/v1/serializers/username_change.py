from rest_framework import serializers


class SelfUsernameChangeSerializer(serializers.Serializer):
    new_username = serializers.CharField(max_length=150)
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)


class AdminUsernameChangeSerializer(serializers.Serializer):
    new_username = serializers.CharField(max_length=150)
    reason = serializers.CharField()

    def validate_reason(self, value):
        reason = (value or "").strip()
        if not reason:
            raise serializers.ValidationError("Reason is required for admin username changes.")
        return reason
