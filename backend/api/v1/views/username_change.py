from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserRole, UsernameChangeSource
from accounts.services.username_change_service import (
    UsernameChangeError,
    change_username,
)
from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.username_change import (
    AdminUsernameChangeSerializer,
    SelfUsernameChangeSerializer,
)
from api.v1.throttles.auth_password_reset import UsernameChangeSelfThrottle

User = get_user_model()


def _error_response(exc: UsernameChangeError) -> Response:
    code = exc.code
    if code == "permission_denied":
        http_status = status.HTTP_403_FORBIDDEN
    elif code in {"duplicate_username", "reserved_username", "invalid_verification"}:
        http_status = status.HTTP_400_BAD_REQUEST
    elif code in {"invalid_username", "rate_limited", "missing_reason"}:
        http_status = status.HTTP_400_BAD_REQUEST
    else:
        http_status = status.HTTP_400_BAD_REQUEST
    return Response({"detail": exc.detail}, status=http_status)


class CustomerSelfUsernameChangeView(APIView):
    permission_classes = [IsAuthenticated, IsCustomer]
    throttle_classes = [UsernameChangeSelfThrottle]

    def patch(self, request):
        serializer = SelfUsernameChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = change_username(
                target_user=request.user,
                new_username=serializer.validated_data["new_username"],
                changed_by=request.user,
                source=UsernameChangeSource.SELF,
                verification_context={
                    "current_password": serializer.validated_data["current_password"],
                    "ip_address": request.META.get("REMOTE_ADDR"),
                    "user_agent": request.META.get("HTTP_USER_AGENT", ""),
                },
            )
        except UsernameChangeError as exc:
            return _error_response(exc)

        return Response(
            {
                "username": result.username,
                "changed": result.changed,
                "requires_relogin": result.requires_relogin,
            },
            status=status.HTTP_200_OK,
        )


class PartnerSelfUsernameChangeView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]
    throttle_classes = [UsernameChangeSelfThrottle]

    def patch(self, request):
        serializer = SelfUsernameChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = change_username(
                target_user=request.user,
                new_username=serializer.validated_data["new_username"],
                changed_by=request.user,
                source=UsernameChangeSource.SELF,
                verification_context={
                    "current_password": serializer.validated_data["current_password"],
                    "ip_address": request.META.get("REMOTE_ADDR"),
                    "user_agent": request.META.get("HTTP_USER_AGENT", ""),
                },
            )
        except UsernameChangeError as exc:
            return _error_response(exc)

        return Response(
            {
                "username": result.username,
                "changed": result.changed,
                "requires_relogin": result.requires_relogin,
            },
            status=status.HTTP_200_OK,
        )


class AdminUserUsernameChangeView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, user_id: int):
        serializer = AdminUsernameChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target = User.objects.filter(id=user_id).first()
        if target is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if getattr(target, "role", "") not in {UserRole.CUSTOMER, UserRole.PARTNER}:
            return Response(
                {"detail": "You do not have permission to change this username."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            result = change_username(
                target_user=target,
                new_username=serializer.validated_data["new_username"],
                changed_by=request.user,
                source=UsernameChangeSource.ADMIN,
                reason=serializer.validated_data["reason"],
                verification_context={
                    "ip_address": request.META.get("REMOTE_ADDR"),
                    "user_agent": request.META.get("HTTP_USER_AGENT", ""),
                },
            )
        except UsernameChangeError as exc:
            return _error_response(exc)

        return Response(
            {
                "username": result.username,
                "changed": result.changed,
                "requires_relogin": result.requires_relogin,
            },
            status=status.HTTP_200_OK,
        )
