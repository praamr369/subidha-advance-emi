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

    default_error_messages = {
        "no_active_account": "Unable to log in with provided credentials.",
        "invalid_credentials": "Unable to log in with provided credentials.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Additive support: allow identifier-based login without breaking existing payloads.
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
        # Fast heuristic; final validation happens via DB lookup.
        return "@" in (identifier or "")

    @staticmethod
    def _normalize_phone_candidates(identifier: str) -> list[str]:
        """
        Returns safe, conservative phone candidates for lookup.
        We never attempt to guess across many variants; only normalize separators and
        optionally try the last 10 digits (common India storage pattern).
        """
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

        # De-dup while preserving order
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
        # Conservative window to avoid treating normal usernames as phones.
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

            # Backward-safe fallback: if phone is only stored on Customer profile
            # (older data/imports), resolve via one-to-one relationship.
            customer_qs = Customer.objects.select_related("user").filter(phone__in=candidates)
            customer_matches = list(customer_qs[:2])
            if len(customer_matches) != 1:
                return None
            return customer_matches[0].user

        # Default: username case-insensitive match.
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

        return token

    def validate(self, attrs):
        raw_identifier = (
            attrs.get("identifier")
            or attrs.get(self.username_field)
            or ""
        )
        identifier = self._normalize_identifier(str(raw_identifier))

        # Resolve identifier → canonical username to keep the existing auth backend,
        # JWT payload, throttling, and audit/logging behavior stable.
        resolved_user: User | None = None
        if identifier:
            resolved_user = self._resolve_user_for_identifier(identifier)

        if resolved_user is not None:
            attrs[self.username_field] = resolved_user.get_username()
        else:
            # SimpleJWT expects username_field key to exist. For unknown/ambiguous
            # identifiers, pass through the raw value so authentication fails safely.
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

        # Defense in depth: never issue tokens for inactive users, even if a custom
        # backend changes behavior in the future.
        if not getattr(user, "is_active", False):
            raise AuthenticationFailed(self.error_messages["no_active_account"])

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
