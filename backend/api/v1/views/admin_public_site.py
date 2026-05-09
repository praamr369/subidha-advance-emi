from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.public_site import PublicBusinessProfileSerializer
from subscriptions.models_business_setup import PublicBusinessProfile
from subscriptions.services.public_site_service import (
    get_active_public_business_profile,
    upsert_public_business_profile,
)


class AdminPublicBusinessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        profile = get_active_public_business_profile()
        if profile is None:
            # Safe defaults so the admin form never depends on a 404 from this endpoint.
            placeholder = PublicBusinessProfile(is_active=True)
            return Response(PublicBusinessProfileSerializer(placeholder).data)
        return Response(PublicBusinessProfileSerializer(profile).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial: bool):
        instance = get_active_public_business_profile()
        serializer = PublicBusinessProfileSerializer(
            instance=instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        profile = upsert_public_business_profile(
            data=serializer.validated_data,
            instance=instance,
            performed_by=request.user,
        )
        return Response(PublicBusinessProfileSerializer(profile).data, status=status.HTTP_200_OK)

