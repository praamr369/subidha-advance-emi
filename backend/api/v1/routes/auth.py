from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.serializers import CustomTokenSerializer
from django.core.cache import cache
from api.v1.throttles.auth_password_reset import AuthLoginThrottle
from api.v1.views.auth_password_reset import (
    confirm_password_reset_view,
    request_password_reset,
    resend_password_reset_otp_view,
)
from api.v1.views.auth_views import google_auth_config_view, google_auth_view, logout_user, register_user
from api.v1.views.user import MeView



import uuid
import logging
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from accounts.models import LoginAudit, UserSession, UserRole, TOTPDevice

security_logger = logging.getLogger("security.events")

def _get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")

class CustomTokenView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer
    throttle_classes = [AuthLoginThrottle]

    def post(self, request, *args, **kwargs):
        ip = _get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")

        # Defense against brute-force & credential stuffing attacks
        lockout_window = timezone.now() - timezone.timedelta(minutes=15)
        
        # Check IP-level repeated failures: locks out attacking client without denying service to real user
        latest_success_ip = LoginAudit.objects.filter(
            ip_address=ip,
            timestamp__gte=lockout_window,
            status="SUCCESS",
        ).order_by("-timestamp").first()

        ip_filter = {"ip_address": ip, "status": "FAILED"}
        if latest_success_ip:
            ip_filter["timestamp__gt"] = latest_success_ip.timestamp
        else:
            ip_filter["timestamp__gte"] = lockout_window

        recent_ip_failures = LoginAudit.objects.filter(**ip_filter).count()

        identifier = (request.data.get("identifier") or request.data.get("username") or "").strip()

        if recent_ip_failures >= 5:
            security_logger.warning(
                "Security Alert: Blocked brute-force attempt from IP %s on identifier %s",
                ip,
                identifier,
            )
            return Response(
                {
                    "detail": "Too many failed login attempts from this connection. Please wait 15 minutes before trying again.",
                    "locked_out": True,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
            user = serializer.user

            # MFA Check
            if user.role == UserRole.ADMIN:
                try:
                    totp_device = user.totp_device
                    if totp_device.is_verified:
                        mfa_code = request.data.get("mfa_code")
                        if not mfa_code:
                            # Required but not provided
                            return Response(
                                {
                                    "mfa_required": True,
                                    "detail": "MFA code is required.",
                                    "identifier": user.username,
                                },
                                status=status.HTTP_401_UNAUTHORIZED,
                            )

                        # 1. Per-account brute-force throttle on MFA guesses
                        mfa_lockout_key = f"mfa_failures:{user.id}"
                        failed_mfa_count = cache.get(mfa_lockout_key, 0)
                        if failed_mfa_count >= 5:
                            security_logger.warning(
                                "auth.mfa_locked_out",
                                extra={"user_id": user.id, "ip": ip, "attempts": failed_mfa_count},
                            )
                            return Response(
                                {
                                    "detail": "Too many failed verification attempts for this account. Please wait 5 minutes before trying again.",
                                    "mfa_required": True,
                                    "locked_out": True,
                                },
                                status=status.HTTP_429_TOO_MANY_REQUESTS,
                            )

                        # 2. Strict format sanitization (strip whitespace/dashes, validate 6 digits)
                        raw_code = str(mfa_code).replace(" ", "").replace("-", "").strip()
                        if not raw_code.isdigit() or len(raw_code) != 6:
                            return Response(
                                {
                                    "detail": "Verification code must be exactly 6 digits.",
                                    "mfa_required": True,
                                },
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                        clean_code = raw_code

                        # 3. Anti-Replay: Verify this specific OTP has not already been used within its window
                        replay_cache_key = f"totp_used:{user.id}:{clean_code}"
                        if cache.get(replay_cache_key):
                            security_logger.warning(
                                "auth.mfa_replay_blocked",
                                extra={"user_id": user.id, "ip": ip},
                            )
                            return Response(
                                {
                                    "detail": "This verification code has already been used. Please wait for the next 30-second code on your phone.",
                                    "mfa_required": True,
                                },
                                status=status.HTTP_401_UNAUTHORIZED,
                            )

                        # 4. Cryptographic TOTP Verification with +/- 30s clock drift tolerance
                        import pyotp
                        totp = pyotp.TOTP(totp_device.secret_key)
                        if not totp.verify(clean_code, valid_window=1):
                            cache.set(mfa_lockout_key, failed_mfa_count + 1, timeout=300)
                            LoginAudit.objects.create(user=user, ip_address=ip, user_agent=ua, status="FAILED")
                            security_logger.warning(
                                "auth.mfa_failed",
                                extra={"user_id": user.id, "ip": ip, "attempt": failed_mfa_count + 1},
                            )
                            return Response(
                                {
                                    "detail": "Invalid verification code. Please check Google Authenticator on your phone.",
                                    "mfa_required": True,
                                },
                                status=status.HTTP_401_UNAUTHORIZED,
                            )

                        # 5. Success: clear failure counter & record code in anti-replay cache
                        cache.delete(mfa_lockout_key)
                        cache.set(replay_cache_key, True, timeout=120)
                        security_logger.info(
                            "auth.mfa_success",
                            extra={"user_id": user.id, "ip": ip},
                        )
                except TOTPDevice.DoesNotExist:
                    pass

            # Create UserSession
            session_token = str(uuid.uuid4())
            UserSession.objects.create(
                user=user,
                session_token=session_token,
                device_name=request.data.get("device_name", "Unknown Device"),
                ip_address=ip,
                user_agent=ua
            )

            # Create LoginAudit
            LoginAudit.objects.create(user=user, ip_address=ip, user_agent=ua, status="SUCCESS")

            data = serializer.validated_data
            data["session_token"] = session_token
            if user.role == UserRole.ADMIN:
                has_mfa = bool(hasattr(user, "totp_device") and user.totp_device.is_verified)
                if isinstance(data.get("user"), dict):
                    data["user"]["mfa_enabled"] = has_mfa
                data["mfa_enabled"] = has_mfa
            return Response(data, status=status.HTTP_200_OK)

        except Exception as e:
            # Try to log failure if user is resolvable
            if hasattr(serializer, "user") and serializer.user:
                LoginAudit.objects.create(user=serializer.user, ip_address=ip, user_agent=ua, status="FAILED")
            elif "identifier" in request.data:
                # Attempt to resolve user from identifier to log failure
                from accounts.serializers import CustomTokenSerializer
                user = CustomTokenSerializer._resolve_user_for_identifier(request.data["identifier"])
                if user:
                    LoginAudit.objects.create(user=user, ip_address=ip, user_agent=ua, status="FAILED")
            raise e


urlpatterns = [
    path("login/", CustomTokenView.as_view(), name="login"),
    path("register/", register_user, name="register"),
    path("google/", google_auth_view, name="google-auth"),
    path("google/config/", google_auth_config_view, name="google-auth-config"),
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("logout/", logout_user, name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("forgot-password/", request_password_reset, name="forgot-password"),
    path("resend-reset-otp/", resend_password_reset_otp_view, name="resend-reset-otp"),
    path("reset-password/", confirm_password_reset_view, name="reset-password"),
]
from api.v1.views.auth_security import MFASetupView, SessionListView, SessionRevokeView, SessionRevokeAllView

urlpatterns.extend([
    path("mfa/setup/", MFASetupView.as_view(), name="mfa-setup"),
    path("sessions/", SessionListView.as_view(), name="sessions-list"),
    path("sessions/<int:pk>/revoke/", SessionRevokeView.as_view(), name="session-revoke"),
    path("sessions/revoke-all/", SessionRevokeAllView.as_view(), name="session-revoke-all"),
])
