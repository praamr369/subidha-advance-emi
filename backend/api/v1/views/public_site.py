from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers.public_site import PublicBusinessProfilePublicSerializer
from subscriptions.services.public_site_service import get_active_public_business_profile


class PublicBusinessProfileView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        profile = get_active_public_business_profile()
        if not profile:
            return Response({"profile": None})
        return Response({"profile": PublicBusinessProfilePublicSerializer(profile).data})

