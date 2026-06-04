import logging

import re

from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import UserRole
from subscriptions.models import Customer

User = get_user_model()
security_logger = logging.getLogger("security.events")


def staff_identity_payload(user):
    identity = getattr(user, "staff_identity", None)
    if identity is None:
        return None
    employee = getattr(identity, "employee", None)
    return {
        "staff_profile_id": getattr(employee, "id", None),
        "employee_code": getattr(employee, "employee_code", "") or "",
        "display_name": getattr(employee, "name", "") or user.get_username(),
        "login_enabled": bool(getattr(identity, "login_enabled", False)),
    }


class UserSerializer(serializers.ModelSerializer):
    staff_profile_id = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

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
            "staff_profile_id",
            "display_name",
            "is_active",
            "is_staff",
            "is_superuser",
        )
        read_only_fields = (
            "id",
            "role",
            "staff_profile_id",
            "display_name",
            "is_active",
            "is_staff",
            "is_superuser",
        )

    def get_staff_profile_id(self, obj):
        payload = staff_identity_payload(obj)
        return payload["staff_profile_id"] if payload else None

    def get_display_name(self, obj):
        payload = staff_identity_payload(obj)
        if payload:
            return payload["display_name"]
        full_name = f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return full_name or obj.username


class CustomTokenSerializer(TokenObtainPairSerializer):
    """
    Canonical JWT serializer for SUBIDHA CORE.

    Enterprise rules:
    - business role comes from accounts.User.role
    - token/user payload must not derive role from Django groups
    - payload should be stable for frontend routing and guards
    """

    default_error_messages = {
        "no_active_account": "Unable to log in with provided credentials.",
        "invalid_credentials": "Unable to log in with provided credentials.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        username_field = self.username_field
        if username_field in self.fields:
            self.fields[username_field].required = False
            self.fields[username_field].allow_blank = True

        self.fields["identifier"] = serializers.CharField(
            required=False,
            allow_blank=False,
            write_only=True,
            help_text="Username, email, or phone number.",
        )

    @staticmethod
    def _normalize_identifier(raw: str) -> str:
        return (raw or "").strip()

    @staticmethod
    def _is_email_identifier(identifier: str) -> bool:
        return "@" in (identifier or "")

    @staticmethod
    def _normalize_phone_candidates(identifier: str) -> list[str]:
        raw = (identifier or "").strip()
        if not raw:
            return []

        has_plus = raw.startswith("+")
        digits = re.sub(r"[^\d]", "", raw)
        if not digits:
            return []

        candidates: list[str] = []
        if has_plus:
            candidates.append(f"+{digits}")
        candidates.append(digits)

        if len(digits) > 10:
            candidates.append(digits[-10:])

        unique: list[str] = []
        for item in candidates:
            if item not in unique:
                unique.append(item)
        return unique

    @classmethod
    def _looks_like_phone(cls, identifier: str) -> bool:
        raw = (identifier or "").strip()
        if not raw:
            return False
        if "@" in raw:
            return False
        digits = re.sub(r"[^\d]", "", raw)
        return 7 <= len(digits) <= 15

    @classmethod
    def _resolve_user_for_identifier(cls, identifier: str) -> User | None:
        identifier = cls._normalize_identifier(identifier)
        if not identifier:
            return None

        if cls._is_email_identifier(identifier):
            qs = User.objects.filter(email__iexact=identifier)
            matches = list(qs[:2])
            if len(matches) != 1:
                return None
            return matches[0]

        if cls._looks_like_phone(identifier):
            candidates = cls._normalize_phone_candidates(identifier)
            if not candidates:
                return None

            user_qs = User.objects.filter(phone__in=candidates)
            user_matches = list(user_qs[:2])
            if len(user_matches) == 1:
                return user_matches[0]
            if len(user_matches) > 1:
                return None

            customer_qs = Customer.objects.select_related("user").filter(phone__in=candidates)
            customer_matches = list(customer_qs[:2])
            if len(customer_matches) != 1:
                return None
            return customer_matches[0].user

        qs = User.objects.filter(username__iexact=identifier)
        matches = list(qs[:2])
        if len(matches) != 1:
            return None
        return matches[0]

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["user_id"] = user.id
        token["username"] = user.username
        token["role"] = getattr(user, "role", "") or ""
        token["phone"] = getattr(user, "phone", "") or ""
        token["is_staff"] = bool(getattr(user, "is_staff", False))
        token["is_superuser"] = bool(getattr(user, "is_superuser", False))
        staff_payload = staff_identity_payload(user)
        if staff_payload:
            token["staff_profile_id"] = staff_payload["staff_profile_id"]
            token["display_name"] = staff_payload["display_name"]

        return token

    def validate(self, attrs):
        raw_identifier = (
            attrs.get("identifier")
            or attrs.get(self.username_field)
            or ""
        )
        identifier = self._normalize_identifier(str(raw_identifier))

        resolved_user: User | None = None
        if identifier:
            resolved_user = self._resolve_user_for_identifier(identifier)

        if resolved_user is not None:
            attrs[self.username_field] = resolved_user.get_username()
        else:
            attrs.setdefault(self.username_field, identifier)

        try:
            data = super().validate(attrs)
        except (AuthenticationFailed, serializers.ValidationError):
            security_logger.warning(
                "auth.login_failed",
                extra={
                    "identifier": identifier,
                    "username": (attrs.get(self.username_field) or "").strip(),
                },
            )
            raise AuthenticationFailed(self.error_messages["invalid_credentials"])

        user = self.user

        if not getattr(user, "is_active", False):
            raise AuthenticationFailed(self.error_messages["no_active_account"])
        staff_payload = staff_identity_payload(user)
        if getattr(user, "role", None) == UserRole.STAFF and (not staff_payload or not staff_payload["login_enabled"]):
            raise AuthenticationFailed(self.error_messages["no_active_account"])

        display_name = staff_payload["display_name"] if staff_payload else (f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip() or user.username)
        data["user"] = {
            "id": user.id,
            "username": user.username,
            "email": getattr(user, "email", "") or "",
            "phone": getattr(user, "phone", "") or "",
            "first_name": getattr(user, "first_name", "") or "",
            "last_name": getattr(user, "last_name", "") or "",
            "role": getattr(user, "role", "") or "",
            "staff_profile_id": staff_payload["staff_profile_id"] if staff_payload else None,
            "display_name": display_name,
            "is_active": bool(getattr(user, "is_active", False)),
            "is_staff": bool(getattr(user, "is_staff", False)),
            "is_superuser": bool(getattr(user, "is_superuser", False)),
        }
        return data
