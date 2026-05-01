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


class CustomTokenView(TokenObtainPairView):
    serializer_class = CustomTokenSerializer
    throttle_classes = [AuthLoginThrottle]


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