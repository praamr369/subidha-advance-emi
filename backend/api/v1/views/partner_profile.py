from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner


class _PasswordChangeSerializer(drf_serializers.Serializer):
    current_password = drf_serializers.CharField()
    new_password = drf_serializers.CharField(min_length=8)
    confirm_password = drf_serializers.CharField(min_length=8)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise drf_serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class PartnerSelfPasswordChangeView(APIView):
    """
    Partner self-service password change.
    Requires current_password for verification. New password must be at least 8 chars.
    """
    permission_classes = [IsAuthenticated, IsPartner]

    def post(self, request):
        serializer = _PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        if not user.check_password(data["current_password"]):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(data["new_password"])
        user.save(update_fields=["password"])

        return Response(
            {
                "changed": True,
                "detail": "Password changed successfully. Please sign in again with your new password.",
                "requires_relogin": True,
            }
        )
