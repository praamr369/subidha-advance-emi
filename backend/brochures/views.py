from __future__ import annotations

import secrets

from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import HasRole
from brochures.models import BrochureDocument
from brochures.serializers import (
    BrochureDocumentSerializer,
    BrochureProductQuerySerializer,
    BrochureRequestSerializer,
    PublicBrochureSerializer,
)
from brochures.services.brochure_pdf_service import build_brochure_pdf
from brochures.services.brochure_product_query_service import get_brochure_products


class CanManageBrochures(HasRole):
    allowed_roles = ("ADMIN", "CASHIER", "STAFF")


DEFAULT_TITLES = {
    BrochureDocument.BrochureType.RENT: "Subidha Furniture Rent Catalog",
    BrochureDocument.BrochureType.LEASE: "Subidha Furniture Lease Catalog",
    BrochureDocument.BrochureType.LUCKY_EMI: "Subidha Furniture Lucky EMI Catalog",
    BrochureDocument.BrochureType.DIRECT_SALE: "Subidha Furniture Direct Sale Price List",
    BrochureDocument.BrochureType.CUSTOM: "Subidha Furniture Selected Product Catalog",
}


def _brochure_no() -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    for _ in range(10):
        candidate = f"BRO-{date_part}-{secrets.token_hex(3).upper()}"
        if not BrochureDocument.objects.filter(brochure_no=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique brochure number.")


def _public_token() -> str:
    for _ in range(10):
        candidate = secrets.token_urlsafe(36)
        if not BrochureDocument.objects.filter(public_token=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique public brochure token.")


def _safe_products(validated_data: dict) -> tuple[str, list[dict]]:
    requested_type = validated_data["brochure_type"]
    product_ids = validated_data.get("product_ids") or []
    document_type = (
        BrochureDocument.BrochureType.CUSTOM if product_ids else requested_type
    )
    products = get_brochure_products(
        brochure_type=requested_type,
        category=validated_data.get("category"),
        product_ids=product_ids,
    )
    if not products:
        raise ValidationError(
            {"products": "No brochure-safe products matched the selected filters."}
        )
    return document_type, products


class AdminBrochureProductsView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        serializer = BrochureProductQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        rows = get_brochure_products(**serializer.validated_data)
        return Response({"count": len(rows), "results": rows})


class AdminBrochurePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = BrochureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_type, products = _safe_products(serializer.validated_data)
        return Response(
            {
                "brochure_type": document_type,
                "requested_brochure_type": serializer.validated_data["brochure_type"],
                "title": serializer.validated_data.get("title")
                or DEFAULT_TITLES[document_type],
                "product_count": len(products),
                "products": products,
                "terms": [
                    "Prices are indicative until final quotation/contract.",
                    "Security deposit and delivery charges may apply.",
                    "Stock availability can change.",
                    "Brochure does not reserve stock.",
                    "Final billing follows approved invoice/contract.",
                ],
            }
        )


class AdminBrochureGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = BrochureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        document_type, products = _safe_products(validated)
        title = (validated.get("title") or DEFAULT_TITLES[document_type]).strip()
        brochure_no = _brochure_no()
        generated_at = timezone.now()
        pdf_bytes = build_brochure_pdf(
            brochure_no=brochure_no,
            brochure_type=document_type,
            title=title,
            products=products,
            generated_at=generated_at,
        )

        document = BrochureDocument(
            brochure_no=brochure_no,
            brochure_type=document_type,
            title=title,
            public_token=_public_token(),
            filter_payload={
                "requested_brochure_type": validated["brochure_type"],
                "category": validated.get("category") or None,
                "product_ids": validated.get("product_ids") or [],
            },
            product_snapshot=products,
            expires_at=validated.get("expires_at"),
            created_by=request.user,
            status=BrochureDocument.Status.GENERATED,
        )
        document.pdf_file.save(
            f"{brochure_no.lower()}.pdf",
            ContentFile(pdf_bytes),
            save=False,
        )
        saved_name = document.pdf_file.name
        try:
            with transaction.atomic():
                document.save()
        except Exception:
            if saved_name:
                document.pdf_file.storage.delete(saved_name)
            raise

        output = BrochureDocumentSerializer(document, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)


class AdminBrochureListView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = BrochureDocument.objects.select_related("created_by").all()[:100]
        serializer = BrochureDocumentSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response({"count": len(serializer.data), "results": serializer.data})


class AdminBrochureDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request, pk):
        document = get_object_or_404(
            BrochureDocument.objects.select_related("created_by"),
            pk=pk,
        )
        return Response(
            BrochureDocumentSerializer(document, context={"request": request}).data
        )


class PublicBrochureDetailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_token):
        document = get_object_or_404(
            BrochureDocument,
            public_token=public_token,
            status=BrochureDocument.Status.GENERATED,
        )
        if document.expires_at and document.expires_at <= timezone.now():
            return Response(
                {"detail": "This brochure link has expired."},
                status=status.HTTP_410_GONE,
            )
        return Response(
            PublicBrochureSerializer(document, context={"request": request}).data
        )
