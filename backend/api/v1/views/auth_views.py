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
from subscriptions.enums import CustomerSource, KycStatus
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
    visitor_session_id = serializers.CharField(required=False, allow_blank=True, default="")

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

    visitor_session_id = (serializer.validated_data.get("visitor_session_id") or "").strip()
    if visitor_session_id:
        try:
            from crm.models import WebappVisitorEvent
            cust = Customer.objects.filter(phone=user.phone).first()
            WebappVisitorEvent.objects.filter(session_id=visitor_session_id).update(
                is_registered=True,
                customer=cust,
            )
            WebappVisitorEvent.objects.create(
                session_id=visitor_session_id,
                path="/register",
                event_type=WebappVisitorEvent.EventType.REGISTER_SUCCESS,
                customer=cust,
                is_registered=True,
                ip_address=_client_ip(request),
            )
        except Exception as exc:
            security_logger.warning("Failed to link visitor event on registration: %s", exc)

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


def _get_active_google_client_id() -> str:
    """
    Retrieves the configured Google OAuth 2.0 Client ID.
    Priority:
    1. Admin UI database setting in EmailSMTPSettings (allows admin to paste directly in web UI).
    2. Environment variable GOOGLE_CLIENT_ID (fallback for containerized/infra deployment).
    """
    from django.conf import settings
    try:
        from business_setup.models.email_smtp import EmailSMTPSettings
        smtp_cfg = EmailSMTPSettings.objects.filter(is_active=True).first()
        if smtp_cfg and smtp_cfg.google_client_id:
            cleaned = smtp_cfg.google_client_id.strip().strip("\"'")
            if cleaned:
                return cleaned
    except Exception:
        pass

    return getattr(settings, "GOOGLE_CLIENT_ID", "").strip().strip("\"'")


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def google_auth_config_view(request):
    """
    Public configuration endpoint for Google OAuth client-side initialization.
    Returns the Google Client ID configured in database or environment.
    """
    client_id = _get_active_google_client_id()
    return Response(
        {
            "google_client_id": client_id,
            "is_configured": bool(client_id),
        },
        status=status.HTTP_200_OK,
    )


def _verify_google_id_token(id_token: str) -> dict:
    """
    Verifies a Google ID token using Google's public tokeninfo endpoint.
    100% free, zero external paid APIs.
    """
    import requests
    from django.conf import settings

    # In local testing or simulated unit tests, if a mock hook is active:
    mock_verifier = getattr(settings, "_MOCK_GOOGLE_VERIFIER", None)
    if callable(mock_verifier):
        return mock_verifier(id_token)

    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    try:
        response = requests.get(url, timeout=7)
    except Exception as exc:
        security_logger.error("google_auth.network_error: %s", exc)
        raise DjangoValidationError("Failed to connect to Google authentication service. Please check your internet connection.")

    if response.status_code != 200:
        security_logger.warning("google_auth.invalid_token: status=%s body=%s", response.status_code, response.text[:200])
        raise DjangoValidationError("Invalid or expired Google authentication token.")

    payload = response.json()

    # Validate issuer
    iss = payload.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise DjangoValidationError("Invalid Google token issuer.")

    # Validate email verification
    email_verified = payload.get("email_verified")
    if str(email_verified).lower() not in ("true", "1"):
        raise DjangoValidationError("Google email address is not verified.")

    # Validate Google Client ID if configured in database or settings
    active_client_id = _get_active_google_client_id()
    if active_client_id:
        token_aud = payload.get("aud")
        if token_aud != active_client_id:
            security_logger.warning("google_auth.audience_mismatch: expected=%s got=%s", active_client_id, token_aud)
            raise DjangoValidationError("Google client ID mismatch.")

    return payload


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthRegistrationThrottle])
def google_auth_view(request):
    """
    Public Google OAuth 2.0 / Google Identity Services endpoint.
    - 100% free (Google Identity Services + tokeninfo).
    - Exclusively creates or authenticates CUSTOMER role.
    - Requires customer mobile phone number to activate KYC readiness, SFEMI access, and in-store profile linking.
    """
    id_token = (request.data.get("id_token") or "").strip()
    if not id_token:
        return Response(
            {"detail": "Google ID token (id_token) is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        google_data = _verify_google_id_token(id_token)
    except DjangoValidationError as exc:
        msg = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    email = (google_data.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "No email address found in Google token."}, status=status.HTTP_400_BAD_REQUEST)

    first_name = (google_data.get("given_name") or "").strip()
    last_name = (google_data.get("family_name") or "").strip()
    full_name = (google_data.get("name") or f"{first_name} {last_name}").strip() or "Customer"

    raw_phone = (request.data.get("phone") or "").strip()
    norm_phone = ""
    if raw_phone:
        digits_only = re.sub(r"[^\d]", "", raw_phone)
        if len(digits_only) == 12 and digits_only.startswith("91"):
            norm_phone = digits_only[2:]
        elif len(digits_only) == 11 and digits_only.startswith("0"):
            norm_phone = digits_only[1:]
        elif len(digits_only) == 10:
            norm_phone = digits_only
        elif 10 <= len(digits_only) <= 15:
            norm_phone = digits_only
        else:
            return Response(
                {"detail": "Please enter a valid 10-digit mobile phone number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # 1. Check if a User already exists with this verified Google email
    user = User.objects.filter(email__iexact=email).first()

    if user is not None:
        if user.role != UserRole.CUSTOMER:
            security_logger.warning("google_auth.internal_user_blocked", extra={"user_id": user.pk, "role": user.role})
            return Response(
                {"detail": "This Google account belongs to internal staff or administration. Please sign in using your administrative credentials on the staff login portal."},
                status=status.HTTP_403_FORBIDDEN,
            )

        customer = Customer.objects.filter(user=user).first()
        user_phone = (user.phone or "").strip()

        # If user has no phone yet, but a valid phone was provided in this request:
        if not user_phone and norm_phone:
            conflict_user = User.objects.filter(phone=norm_phone).exclude(pk=user.pk).first()
            if conflict_user:
                return Response(
                    {"detail": f"Phone number {norm_phone} is already linked to another customer account. Please contact support."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.phone = norm_phone
            user.save(update_fields=["phone"])
            if customer:
                customer.phone = norm_phone
                customer.save(update_fields=["phone"])
            user_phone = norm_phone

        # If user still does not have a phone attached:
        if not user_phone:
            return Response(
                {
                    "requires_phone": True,
                    "email": email,
                    "name": full_name,
                    "id_token": id_token,
                    "detail": "Please provide your mobile phone number to connect your customer profile and KYC records.",
                },
                status=status.HTTP_200_OK,
            )

        # Ensure Customer profile exists
        if not customer:
            Customer.objects.create(
                user=user,
                name=full_name,
                phone=user_phone,
                customer_source=CustomerSource.ONLINE,
                kyc_status=KycStatus.PENDING,
            )

        update_last_login(None, user)
        security_logger.info("google_auth.login_success", extra={"user_id": user.pk, "email": email, "ip": _client_ip(request)})

        auth_payload = _build_auth_payload(user)
        auth_payload["requires_phone"] = False
        return Response(auth_payload, status=status.HTTP_200_OK)

    # 2. No User exists with this email yet.
    # If phone was not passed in this request, ask user for phone:
    if not norm_phone:
        return Response(
            {
                "requires_phone": True,
                "email": email,
                "name": full_name,
                "id_token": id_token,
                "detail": "Welcome! Please enter your mobile phone number to complete registration and connect your KYC details.",
            },
            status=status.HTTP_200_OK,
        )

    # Phone was provided: check if an existing User or Customer exists by phone
    existing_user_by_phone = User.objects.filter(phone=norm_phone).first()
    existing_customer_by_phone = Customer.objects.filter(phone=norm_phone).first()

    with transaction.atomic():
        if existing_user_by_phone:
            if existing_user_by_phone.role != UserRole.CUSTOMER:
                return Response(
                    {"detail": "This phone number is associated with internal staff/admin. Please sign in with staff credentials."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Security guard: If existing customer account already has a different confirmed email, do not allow takeover
            existing_email = (existing_user_by_phone.email or "").strip().lower()
            if existing_email and existing_email != email:
                return Response(
                    {
                        "detail": f"The phone number {norm_phone} is already linked to another customer account ({existing_email}). Please log in with that account or use your own phone number."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Link Google email to the existing customer profile
            existing_user_by_phone.email = email
            if not existing_user_by_phone.first_name and first_name:
                existing_user_by_phone.first_name = first_name
            if not existing_user_by_phone.last_name and last_name:
                existing_user_by_phone.last_name = last_name
            existing_user_by_phone.save(update_fields=["email", "first_name", "last_name"])

            if existing_customer_by_phone:
                if existing_customer_by_phone.user_id != existing_user_by_phone.id:
                    existing_customer_by_phone.user = existing_user_by_phone
                    existing_customer_by_phone.save(update_fields=["user"])
            else:
                Customer.objects.create(
                    user=existing_user_by_phone,
                    name=full_name,
                    phone=norm_phone,
                    customer_source=CustomerSource.ONLINE,
                    kyc_status=KycStatus.PENDING,
                )

            update_last_login(None, existing_user_by_phone)
            security_logger.info("google_auth.linked_existing_account", extra={"user_id": existing_user_by_phone.pk, "phone": norm_phone, "email": email, "ip": _client_ip(request)})

            auth_payload = _build_auth_payload(existing_user_by_phone)
            auth_payload["requires_phone"] = False
            auth_payload["linked_existing_account"] = True
            return Response(auth_payload, status=status.HTTP_200_OK)

        elif existing_customer_by_phone:
            # Customer row created in-store without a direct phone-matched User
            user = getattr(existing_customer_by_phone, "user", None)
            if user:
                existing_user_email = (user.email or "").strip().lower()
                if existing_user_email and existing_user_email != email:
                    return Response(
                        {
                            "detail": f"The phone number {norm_phone} is already associated with another customer profile. Please sign in with your registered account."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.email = email
                user.phone = norm_phone
                user.save(update_fields=["email", "phone"])
            else:
                import uuid
                clean_username = f"cust_{norm_phone[-10:]}"
                if User.objects.filter(username=clean_username).exists():
                    clean_username = f"cust_{uuid.uuid4().hex[:8]}"
                user = User.objects.create_user(
                    username=clean_username,
                    email=email,
                    phone=norm_phone,
                    first_name=first_name,
                    last_name=last_name,
                    role=UserRole.CUSTOMER,
                )
                existing_customer_by_phone.user = user
                existing_customer_by_phone.save(update_fields=["user"])

            update_last_login(None, user)
            security_logger.info("google_auth.linked_existing_customer", extra={"user_id": user.pk, "phone": norm_phone, "email": email, "ip": _client_ip(request)})

            auth_payload = _build_auth_payload(user)
            auth_payload["requires_phone"] = False
            auth_payload["linked_existing_account"] = True
            return Response(auth_payload, status=status.HTTP_200_OK)

        else:
            # Brand new customer registration
            import uuid
            base_username = re.sub(r"[^a-zA-Z0-9_.-]", "", email.split("@")[0])[:25]
            if not base_username or len(base_username) < 3 or User.objects.filter(username=base_username).exists():
                base_username = f"cust_{norm_phone[-10:]}"
                if User.objects.filter(username=base_username).exists():
                    base_username = f"cust_{uuid.uuid4().hex[:8]}"

            user = User.objects.create_user(
                username=base_username,
                email=email,
                phone=norm_phone,
                first_name=first_name,
                last_name=last_name,
                role=UserRole.CUSTOMER,
            )
            Customer.objects.create(
                user=user,
                name=full_name,
                phone=norm_phone,
                customer_source=CustomerSource.ONLINE,
                kyc_status=KycStatus.PENDING,
            )

            update_last_login(None, user)
            security_logger.info("google_auth.register_success", extra={"user_id": user.pk, "phone": norm_phone, "email": email, "ip": _client_ip(request)})

            auth_payload = _build_auth_payload(user)
            auth_payload["requires_phone"] = False
            auth_payload["is_new_customer"] = True
            return Response(auth_payload, status=status.HTTP_201_CREATED)
