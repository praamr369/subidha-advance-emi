from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.brand_data import (
    BrandApplySerializer,
    BrandDirectProfileSerializer,
    BrandImportItemActionSerializer,
    BrandManualPreviewSerializer,
)
from subscriptions.services.brand_data_import_service import (
    apply_approved_items,
    audit_feed,
    create_manual_preview,
    get_public_profile,
    list_sources,
    provider_preview_stub,
    set_item_approval,
    upsert_public_profile,
)


class _AdminBrandBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminBrandDataSourcesView(_AdminBrandBase):
    def get(self, request):
        return Response(list_sources())


class AdminBrandDataManualPreviewView(_AdminBrandBase):
    def post(self, request):
        serializer = BrandManualPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(create_manual_preview(actor=request.user, payload=serializer.validated_data), status=status.HTTP_201_CREATED)


class AdminBrandDataGoogleBusinessPreviewView(_AdminBrandBase):
    def post(self, request):
        payload = provider_preview_stub(provider="GOOGLE_BUSINESS")
        if payload.get("code") == "PROVIDER_NOT_CONFIGURED":
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class AdminBrandDataYoutubePreviewView(_AdminBrandBase):
    def post(self, request):
        payload = provider_preview_stub(provider="YOUTUBE")
        if payload.get("code") == "PROVIDER_NOT_CONFIGURED":
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class AdminBrandDataSocialLinkActionView(_AdminBrandBase):
    def post(self, request):
        serializer = BrandImportItemActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            return Response(set_item_approval(actor=request.user, item_id=data["item_id"], action=data["action"], note=data.get("note", "")))
        except Exception as exc:
            raise ValidationError({"detail": str(exc)}) from exc


class AdminBrandDataApplyView(_AdminBrandBase):
    def post(self, request):
        serializer = BrandApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = apply_approved_items(actor=request.user, item_ids=serializer.validated_data["approved_item_ids"])
        except Exception as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload)


class AdminBrandDataAuditView(_AdminBrandBase):
    def get(self, request):
        return Response(audit_feed())


class AdminBrandDirectProfileView(_AdminBrandBase):
    """Read and directly update the public business profile + social links without the batch/approval workflow."""

    def get(self, request):
        return Response(get_public_profile())

    def patch(self, request):
        serializer = BrandDirectProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = upsert_public_profile(actor=request.user, data=serializer.validated_data)
        except Exception as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(result)
