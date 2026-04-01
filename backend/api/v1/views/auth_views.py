from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import UserRole
from subscriptions.models import Customer

User = get_user_model()


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

    Security rule:
    - public auth may create CUSTOMER only
    - PARTNER / ADMIN / CASHIER are internal roles and must be created by admin
    """

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=True, allow_blank=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)

    # Kept for backward compatibility with older frontend payloads.
    # Public endpoint must not allow internal role creation.
    role = serializers.CharField(required=False, allow_blank=True, default=UserRole.CUSTOMER)

    def validate_username(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Username is required.")

        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")

        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if not value:
            return ""

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already exists.")

        return value

    def validate_phone(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Phone is required.")

        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone already exists.")

        return value

    def validate_role(self, value):
        """
        Public registration is customer-only.
        Older frontend may still send role; accept CUSTOMER, reject everything else.
        """
        normalized = (value or UserRole.CUSTOMER).strip().upper()

        if normalized != UserRole.CUSTOMER:
            raise serializers.ValidationError(
                "Only customer registration is allowed. Partner accounts are created internally by admin."
            )

        return UserRole.CUSTOMER

    def validate(self, attrs):
        """
        Force customer role even if omitted, and prevent internal role escalation.
        """
        role = attrs.get("role") or UserRole.CUSTOMER
        if role != UserRole.CUSTOMER:
            raise serializers.ValidationError(
                {
                    "role": (
                        "Only customer registration is allowed. "
                        "Partner accounts are created internally by admin."
                    )
                }
            )

        attrs["role"] = UserRole.CUSTOMER
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            email=validated_data.get("email", ""),
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
            "is_staff": bool(getattr(user, "is_staff", False)),
            "is_superuser": bool(getattr(user, "is_superuser", False)),
        },
    }


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register_user(request):
    """
    Public self-registration endpoint.

    Allowed:
    - CUSTOMER only

    Disallowed:
    - PARTNER
    - CASHIER
    - ADMIN

    Financial / operational rationale:
    partner is an internal commercial role tied to subscriptions, collections,
    commissions, and payouts, so partner onboarding must remain admin-controlled.
    """
    serializer = RegisterUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    validated = serializer.validated_data

    with transaction.atomic():
        user = serializer.save()

        # Public registration always creates a customer profile.
        Customer.objects.create(
            user=user,
            name=_resolve_customer_name(validated),
            phone=(validated.get("phone") or "").strip(),
        )

    update_last_login(None, user)

    return Response(_build_auth_payload(user), status=status.HTTP_201_CREATED)


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