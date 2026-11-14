from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers.public_site import (
    PublicAnnouncementBannerPublicSerializer,
    PublicBusinessProfilePublicSerializer,
)
from subscriptions.services.public_site_service import (
    get_active_public_announcements,
    get_active_public_business_profile,
)


class PublicBusinessProfileView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        profile = get_active_public_business_profile()
        if not profile:
            from business_setup.models.core import BusinessProfile, PublicBusinessProfile
            bp = BusinessProfile.get_current()
            if bp:
                profile = PublicBusinessProfile(
                    display_name=bp.trade_name or bp.legal_name or "Subidha Core",
                    primary_phone=bp.primary_phone,
                    support_phone=bp.support_phone or bp.primary_phone,
                    primary_email=bp.primary_email,
                    support_email=bp.support_email or bp.primary_email,
                    address_text=f"{bp.address_line_1}, {bp.city}, {bp.state} {bp.postal_code}".strip(", "),
                    city=bp.city,
                    state=bp.state,
                    postal_code=bp.postal_code,
                    is_active=True,
                )
            else:
                profile = PublicBusinessProfile(
                    display_name="Subidha Core",
                    is_active=True,
                )
        return Response({"profile": PublicBusinessProfilePublicSerializer(profile).data})


class PublicAnnouncementsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        banners = get_active_public_announcements()
        return Response({"announcements": PublicAnnouncementBannerPublicSerializer(banners, many=True).data})

