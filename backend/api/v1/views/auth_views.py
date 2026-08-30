import logging
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import UserRole
from api.v1.throttles.auth_password_reset import AuthRegistrationThrottle
from subscriptions.models import Customer

User = get_user_model()

security_logger = logging.getLogger("security")

_PHONE_RE = re.compile(r"^\+?\d{10,15}$")


def _resolve_customer_name(validated_data) -> str:
    first_name = (validated_data.get("first_name") or "").strip()
    last_name = (validated_data.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()

    if full_name:
        return full_name[:100]

    username = (validated_data.get("username") or "").strip()
    if username:
        return username[:100]

    return "Customer"


class RegisterUserSerializer(serializers.Serializer):
    """
    Public self-registration serializer.

    Security rules:
    - public auth may create CUSTOMER only
    - PARTNER / ADMIN / CASHIER are internal roles and must be created by admin
    - admin-created customer accounts (never logged in) can be claimed
    - passwords are validated against Django AUTH_PASSWORD_VALIDATORS
    """

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True, allow_blank=False)
    phone = serializers.CharField(required=True, allow_blank=False)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")

    role = serializers.CharField(required=False, allow_blank=True, default=UserRole.CUSTOMER)

    _claimable_user = None

    def validate_username(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Username is required.")
        if len(value) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters.")
        if not re.match(r"^[a-zA-Z0-9_.\-]+$", value):
            raise serializers.ValidationError("Username may only contain letters, digits, dots, hyphens, and underscores.")

        qs = User.objects.filter(username=value)
        if getattr(self, "_claimable_user", None):
            qs = qs.exclude(pk=self._claimable_user.pk)
        if qs.exists():
            raise serializers.ValidationError("Username already exists.")

        return value

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if not value:
            raise serializers.ValidationError(
                "Email is required for customer access and password reset."
            )

        qs = User.objects.filter(email__iexact=value)
        if getattr(self, "_claimable_user", None):
            qs = qs.exclude(pk=self._claimable_user.pk)
        if qs.exists():
            raise serializers.ValidationError("Email already exists.")

        return value

    def validate_phone(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Phone is required.")

        digits_only = re.sub(r"[^\d]", "", value)
        if not _PHONE_RE.match(value) and not (10 <= len(digits_only) <= 15):
            raise serializers.ValidationError("Enter a valid phone number (10-15 digits).")

        existing_user = User.objects.filter(phone=value).first()
        if existing_user is not None:
            if existing_user.role != UserRole.CUSTOMER:
                raise serializers.ValidationError(
                    "An account with this phone already exists. Please log in instead."
                )
            if not existing_user.is_active:
                raise serializers.ValidationError(
                    "This account has been deactivated. Contact support."
                )
            if existing_user.has_usable_password() and existing_user.last_login is not None:
                raise serializers.ValidationError(
                    "An account with this phone already exists. Please log in instead."
                )
            self._claimable_user = existing_user

        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

    def validate_role(self, value):
        normalized = (value or UserRole.CUSTOMER).strip().upper()
        if normalized != UserRole.CUSTOMER:
            raise serializers.ValidationError(
                "Only customer registration is allowed. Partner accounts are created internally by admin."
            )
        return UserRole.CUSTOMER

    def validate(self, attrs):
        attrs["role"] = UserRole.CUSTOMER

        claimable = getattr(self, "_claimable_user", None)
        if claimable is not None:
            try:
                validate_password(attrs["password"], user=claimable)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": exc.messages})

        return attrs

    def create(self, validated_data):
        claimable = getattr(self, "_claimable_user", None)
        if claimable is not None:
            claimable.set_password(validated_data["password"])
            claimable.username = validated_data["username"]
            claimable.email = validated_data["email"]
            if validated_data.get("first_name"):
                claimable.first_name = validated_data["first_name"]
            if validated_data.get("last_name"):
                claimable.last_name = validated_data["last_name"]
            claimable.save()
            security_logger.info(
                "auth.account_claimed",
                extra={"user_id": claimable.pk, "phone": claimable.phone},
            )
            return claimable
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            email=validated_data["email"],
            phone=validated_data["phone"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            role=UserRole.CUSTOMER,
        )


def _build_auth_payload(user):
    refresh = RefreshToken.for_user(user)

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": {
            "id": user.id,
            "username": user.username,
            "email": getattr(user, "email", "") or "",
            "phone": getattr(user, "phone", "") or "",
            "first_name": getattr(user, "first_name", "") or "",
            "last_name": getattr(user, "last_name", "") or "",
            "role": getattr(user, "role", "") or "",
            "is_active": bool(getattr(user, "is_active", False)),
        },
    }


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthRegistrationThrottle])
def register_user(request):
    """
    Public self-registration endpoint.

    Allowed: CUSTOMER only.
    Throttled: 10/hour per IP to prevent registration spam.
    """
    serializer = RegisterUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    validated = serializer.validated_data

    with transaction.atomic():
        user = serializer.save()

        if not Customer.objects.filter(user=user).exists():
            Customer.objects.create(
                user=user,
                name=_resolve_customer_name(validated),
                phone=(validated.get("phone") or "").strip(),
            )

    update_last_login(None, user)

    security_logger.info(
        "auth.register_success",
        extra={
            "user_id": user.pk,
            "phone": user.phone,
            "claimed": getattr(serializer, "_claimable_user", None) is not None,
            "ip": _client_ip(request),
        },
    )

    return Response(_build_auth_payload(user), status=status.HTTP_201_CREATED)


def _client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def logout_user(request):
    """
    Best-effort logout.

    Why AllowAny:
    - logout should still work even if access token is expired
    - frontend may only have refresh token at logout time
    - local session must still be cleared safely

    Behavior:
    - if refresh token is valid, blacklist it
    - if refresh token is missing/invalid, still return success
    """
    refresh_token = request.data.get("refresh")

    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass

    return Response(
        {"detail": "Logout completed."},
        status=status.HTTP_200_OK,
    )
