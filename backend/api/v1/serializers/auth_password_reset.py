from rest_framework import serializers

from accounts.models import PasswordResetRequest


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)

    def validate_identifier(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Identifier is required.")
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)
    otp = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    def validate_identifier(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Identifier is required.")
        return value

    def validate_otp(self, value):
        value = (value or "").strip()
        if not value.isdigit() or len(value) != 6:
            raise serializers.ValidationError("Enter a valid 6-digit OTP.")
        return value

    def validate(self, attrs):
        new_password = attrs.get("new_password", "")
        confirm_password = attrs.get("confirm_password", "")

        if new_password != confirm_password:
            raise serializers.ValidationError(
                {"confirm_password": "Password confirmation does not match."}
            )

        if not any(ch.isalpha() for ch in new_password) or not any(ch.isdigit() for ch in new_password):
            raise serializers.ValidationError(
                {"new_password": "Password must include at least one letter and one number."}
            )

        return attrs


class PasswordResetResendSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)

    def validate_identifier(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Identifier is required.")
        return value


class PasswordResetRequestAdminSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True, allow_null=True)
    user_role = serializers.CharField(source="user.role", read_only=True)

    class Meta:
        model = PasswordResetRequest
        fields = [
            "id",
            "user_id",
            "username",
            "user_phone",
            "user_email",
            "user_role",
            "role_snapshot",
            "channel",
            "identifier_snapshot",
            "status",
            "failed_attempt_count",
            "max_attempts",
            "resend_count",
            "last_sent_at",
            "expires_at",
            "verified_at",
            "used_at",
            "requested_by_ip",
            "requested_user_agent",
            "created_at",
            "updated_at",
        ]