from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import UserRole
from accounts.services.password_reset_service import (
    admin_get_password_reset_request,
    admin_invalidate_password_reset_request,
    admin_list_password_reset_requests,
    admin_resend_password_reset_request,
)
from api.v1.serializers.auth_password_reset import PasswordResetRequestAdminSerializer


class IsInternalAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == UserRole.ADMIN
        )


@api_view(["GET"])
@permission_classes([IsInternalAdmin])
def admin_password_reset_request_list(request):
    queryset = admin_list_password_reset_requests(
        q=request.query_params.get("q", ""),
        status=request.query_params.get("status", ""),
        role=request.query_params.get("role", ""),
    )

    serializer = PasswordResetRequestAdminSerializer(queryset, many=True)
    return Response(
        {
            "results": serializer.data,
            "count": len(serializer.data),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsInternalAdmin])
def admin_password_reset_request_detail(request, request_id: int):
    try:
        obj = admin_get_password_reset_request(request_id)
    except Exception:
        return Response({"detail": "Password reset request not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = PasswordResetRequestAdminSerializer(obj)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsInternalAdmin])
def admin_password_reset_request_invalidate(request, request_id: int):
    try:
        result = admin_invalidate_password_reset_request(
            request_id=request_id,
            performed_by=request.user,
        )
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(result, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsInternalAdmin])
def admin_password_reset_request_resend(request, request_id: int):
    try:
        result = admin_resend_password_reset_request(
            request_id=request_id,
            performed_by=request.user,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({"detail": "Password reset request not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(result, status=status.HTTP_200_OK)