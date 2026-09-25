from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.serializers import CustomTokenSerializer
from api.v1.throttles.auth_password_reset import AuthLoginThrottle
from api.v1.views.auth_password_reset import (
    confirm_password_reset_view,
    request_password_reset,
    resend_password_reset_otp_view,
)
from api.v1.views.auth_views import logout_user, register_user
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
        serializer = self.get_serializer(data=request.data)
        ip = _get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")

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
                            return Response({"mfa_required": True, "detail": "MFA code is required."}, status=status.HTTP_401_UNAUTHORIZED)
                        import pyotp
                        totp = pyotp.TOTP(totp_device.secret_key)
                        if not totp.verify(mfa_code):
                            LoginAudit.objects.create(user=user, ip_address=ip, user_agent=ua, status="FAILED")
                            return Response({"detail": "Invalid MFA code."}, status=status.HTTP_401_UNAUTHORIZED)
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
