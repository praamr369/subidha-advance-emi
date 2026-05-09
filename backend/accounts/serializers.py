import logging

from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import UserRole

User = get_user_model()
security_logger = logging.getLogger("security.events")


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_staff",
            "is_superuser",
        )
        read_only_fields = (
            "id",
            "role",
            "is_active",
            "is_staff",
            "is_superuser",
        )




class CustomTokenSerializer(TokenObtainPairSerializer):
    """
    Canonical JWT serializer for SUBIDHA CORE.

    Enterprise rules:
    - business role comes from accounts.User.role
    - token/user payload must not derive role from Django groups
    - payload should be stable for frontend routing and guards
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["user_id"] = user.id
        token["username"] = user.username
        token["role"] = getattr(user, "role", "") or ""
        token["phone"] = getattr(user, "phone", "") or ""
        token["is_staff"] = bool(getattr(user, "is_staff", False))
        token["is_superuser"] = bool(getattr(user, "is_superuser", False))

        return token

    def validate(self, attrs):
        try:
            data = super().validate(attrs)
        except Exception:
            security_logger.warning(
                "auth.login_failed",
                extra={
                    "username": (attrs.get("username") or "").strip(),
                },
            )
            raise
        user = self.user

        data["user"] = {
            "id": user.id,
            "username": user.username,
            "email": getattr(user, "email", "") or "",
            "phone": getattr(user, "phone", "") or "",
            "first_name": getattr(user, "first_name", "") or "",
            "last_name": getattr(user, "last_name", "") or "",
            "role": getattr(user, "role", "") or "",
            "is_active": bool(getattr(user, "is_active", False)),
            "is_staff": bool(getattr(user, "is_staff", False)),
            "is_superuser": bool(getattr(user, "is_superuser", False)),
        }
        return data