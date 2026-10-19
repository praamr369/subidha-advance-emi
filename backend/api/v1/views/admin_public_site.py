from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.public_site import (
    PublicAnnouncementBannerSerializer,
    PublicBusinessProfileSerializer,
)
from subscriptions.models_business_setup import (
    PublicAnnouncementBanner,
    PublicBusinessProfile,
)
from subscriptions.services.public_site_service import (
    create_public_announcement,
    delete_public_announcement,
    get_active_public_business_profile,
    list_admin_public_announcements,
    update_public_announcement,
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


class AdminPublicAnnouncementListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        banners = list_admin_public_announcements()
        return Response({"announcements": PublicAnnouncementBannerSerializer(banners, many=True).data})

    def post(self, request):
        serializer = PublicAnnouncementBannerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        banner = create_public_announcement(
            data=serializer.validated_data,
            performed_by=request.user,
        )
        return Response(PublicAnnouncementBannerSerializer(banner).data, status=status.HTTP_201_CREATED)


class AdminPublicAnnouncementDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_object(self, pk: int):
        return get_object_or_404(PublicAnnouncementBanner, pk=pk)

    def get(self, request, pk: int):
        banner = self.get_object(pk)
        return Response(PublicAnnouncementBannerSerializer(banner).data)

    def patch(self, request, pk: int):
        banner = self.get_object(pk)
        serializer = PublicAnnouncementBannerSerializer(instance=banner, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_public_announcement(
            instance=banner,
            data=serializer.validated_data,
            performed_by=request.user,
        )
        return Response(PublicAnnouncementBannerSerializer(updated).data)

    def put(self, request, pk: int):
        banner = self.get_object(pk)
        serializer = PublicAnnouncementBannerSerializer(instance=banner, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        updated = update_public_announcement(
            instance=banner,
            data=serializer.validated_data,
            performed_by=request.user,
        )
        return Response(PublicAnnouncementBannerSerializer(updated).data)

    def delete(self, request, pk: int):
        banner = self.get_object(pk)
        delete_public_announcement(instance=banner, performed_by=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminPublicBannerImageUploadView(APIView):
    """
    POST /api/v1/admin/public-site/announcements/upload/
    Uploads a banner photo / ad poster, validates file, and returns absolute URL.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        from rest_framework.parsers import MultiPartParser, FormParser
        from core.upload_security import validate_upload, UploadValidationError
        from django.core.files.storage import default_storage
        import os
        import uuid

        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "File is required. Send as 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_upload(
                file,
                allowed_kinds={"jpeg", "png", "webp"},
                max_bytes=10 * 1024 * 1024,
                label="banner_image",
            )
        except UploadValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower() or ".jpg"
        filename = f"business/banners/banner_{uuid.uuid4().hex[:12]}{ext}"
        path = default_storage.save(filename, file)
        url = request.build_absolute_uri(default_storage.url(path))

        return Response({"url": url}, status=status.HTTP_201_CREATED)

