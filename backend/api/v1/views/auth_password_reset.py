from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

from api.v1.serializers.auth_password_reset import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetResendSerializer,
)
from api.v1.throttles.auth_password_reset import (
    ForgotPasswordThrottle,
    ResetPasswordThrottle,
    ResendPasswordResetOtpThrottle,
)
from accounts.services.password_reset_service import (
    confirm_password_reset,
    create_password_reset_request,
    resend_password_reset_otp,
)


def _client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([ForgotPasswordThrottle])
def request_password_reset(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    response_payload, _dispatch_meta = create_password_reset_request(
        identifier=serializer.validated_data["identifier"],
        requested_by_ip=_client_ip(request),
        requested_user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )

    return Response(dict(response_payload), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([ResendPasswordResetOtpThrottle])
def resend_password_reset_otp_view(request):
    serializer = PasswordResetResendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        result = resend_password_reset_otp(
            identifier=serializer.validated_data["identifier"],
            requested_by_ip=_client_ip(request),
            requested_user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(result, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([ResetPasswordThrottle])
def confirm_password_reset_view(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        result = confirm_password_reset(
            identifier=serializer.validated_data["identifier"],
            otp=serializer.validated_data["otp"],
            new_password=serializer.validated_data["new_password"],
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(result, status=status.HTTP_200_OK)