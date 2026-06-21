from __future__ import annotations

import secrets

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import HasRole
from api.v1.pagination import build_paginated_payload
from brochures.models import BrochureDocument, ProductBrochureSettings
from brochures.serializers import (
    BrochureDocumentSerializer,
    BrochureProductQuerySerializer,
    BrochureRequestSerializer,
    ProductBrochureSettingsBulkSerializer,
    ProductBrochureSettingsUpdateSerializer,
    PublicBrochureSerializer,
    brochure_settings_warnings,
    serialize_product_brochure_settings,
)
from brochures.services.brochure_pdf_service import build_brochure_pdf
from brochures.services.brochure_product_query_service import get_brochure_products
from subscriptions.models import Product


class CanManageBrochures(HasRole):
    allowed_roles = ("ADMIN", "CASHIER", "STAFF")


DEFAULT_TITLES = {
    BrochureDocument.BrochureType.RENT: "Subidha Furniture Rent Catalog",
    BrochureDocument.BrochureType.LEASE: "Subidha Furniture Lease Catalog",
    BrochureDocument.BrochureType.LUCKY_EMI: "Subidha Furniture Lucky EMI Catalog",
    BrochureDocument.BrochureType.DIRECT_SALE: "Subidha Furniture Direct Sale Price List",
    BrochureDocument.BrochureType.CUSTOM: "Subidha Furniture Selected Product Catalog",
}

SETTINGS_CREATE_DEFAULTS = {
    "visible_on_public_catalog": False,
    "visible_on_rent_catalog": False,
    "visible_on_lease_catalog": False,
    "visible_on_lucky_emi_catalog": False,
    "visible_on_sale_catalog": False,
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


def _bool_query(value) -> bool | None:
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _settings_queryset(request):
    queryset = Product.objects.select_related(
        "category_master",
        "brochure_settings",
    ).all()
    q = str(request.query_params.get("q") or "").strip()
    category = str(request.query_params.get("category") or "").strip()
    brochure_type = str(request.query_params.get("brochure_type") or "").strip().upper()

    if q:
        queryset = queryset.filter(
            Q(name__icontains=q)
            | Q(product_code__icontains=q)
            | Q(category__icontains=q)
            | Q(category_master__name__icontains=q)
        )
    if category:
        category_query = Q(category__iexact=category) | Q(
            category_master__name__iexact=category
        )
        if category.isdigit():
            category_query |= Q(category_master_id=int(category))
        queryset = queryset.filter(category_query)

    if brochure_type == BrochureDocument.BrochureType.RENT:
        queryset = queryset.filter(is_rent_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.LEASE:
        queryset = queryset.filter(is_lease_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.LUCKY_EMI:
        queryset = queryset.filter(is_emi_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.DIRECT_SALE:
        queryset = queryset.filter(is_direct_sale_enabled=True)

    missing_settings = _bool_query(request.query_params.get("missing_settings"))
    if missing_settings is True:
        queryset = queryset.filter(brochure_settings__isnull=True)
    elif missing_settings is False:
        queryset = queryset.filter(brochure_settings__isnull=False)

    visible_only = _bool_query(request.query_params.get("visible_only"))
    if visible_only is True:
        visibility = Q(
            brochure_settings__visible_on_public_catalog=True,
        )
        if brochure_type == BrochureDocument.BrochureType.RENT:
            visibility &= Q(brochure_settings__visible_on_rent_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.LEASE:
            visibility &= Q(brochure_settings__visible_on_lease_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.LUCKY_EMI:
            visibility &= Q(brochure_settings__visible_on_lucky_emi_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.DIRECT_SALE:
            visibility &= Q(brochure_settings__visible_on_sale_catalog=True)
        queryset = queryset.filter(visibility)

    has_rent_price = _bool_query(request.query_params.get("has_rent_price"))
    if has_rent_price is True:
        queryset = queryset.filter(brochure_settings__monthly_rent__isnull=False)
    elif has_rent_price is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__monthly_rent__isnull=True)
        )

    has_lease_price = _bool_query(request.query_params.get("has_lease_price"))
    if has_lease_price is True:
        queryset = queryset.filter(
            brochure_settings__lease_monthly_amount__isnull=False
        )
    elif has_lease_price is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__lease_monthly_amount__isnull=True)
        )

    has_sale_price = _bool_query(request.query_params.get("has_sale_price"))
    if has_sale_price is True:
        queryset = queryset.filter(base_price__gt=0)
    elif has_sale_price is False:
        queryset = queryset.filter(Q(base_price__isnull=True) | Q(base_price__lte=0))

    featured = _bool_query(request.query_params.get("featured"))
    if featured is True:
        queryset = queryset.filter(brochure_settings__brochure_featured=True)
    elif featured is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__brochure_featured=False)
        )

    return queryset.order_by("name", "product_code", "id").distinct()


def _get_or_create_safe_settings(product):
    return ProductBrochureSettings.objects.get_or_create(
        product=product,
        defaults=SETTINGS_CREATE_DEFAULTS,
    )


def _apply_settings_updates(settings_row, updates):
    for field, value in updates.items():
        setattr(settings_row, field, value)
    settings_row.save()
    return settings_row


class AdminProductBrochureSettingsListView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = _settings_queryset(request)
        payload = build_paginated_payload(
            request,
            queryset,
            lambda rows: [
                serialize_product_brochure_settings(row, request) for row in rows
            ],
            default_page_size=25,
        )
        return Response(payload)


class AdminProductBrochureSettingsDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get_product(self, product_id):
        return get_object_or_404(
            Product.objects.select_related(
                "category_master",
                "brochure_settings",
            ),
            pk=product_id,
        )

    def get(self, request, product_id):
        product = self.get_product(product_id)
        return Response(serialize_product_brochure_settings(product, request))

    def patch(self, request, product_id):
        product = self.get_product(product_id)
        serializer = ProductBrochureSettingsUpdateSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            raise ValidationError({"detail": "Provide at least one setting to update."})

        with transaction.atomic():
            settings_row, _ = _get_or_create_safe_settings(product)
            settings_row = _apply_settings_updates(
                settings_row,
                serializer.validated_data,
            )

        product = self.get_product(product_id)
        return Response(
            {
                "row": serialize_product_brochure_settings(product, request),
                "warnings": brochure_settings_warnings(product, settings_row),
            }
        )


class AdminProductBrochureSettingsBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = ProductBrochureSettingsBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_ids = serializer.validated_data["product_ids"]
        updates = serializer.validated_data["updates"]
        products = {
            product.id: product
            for product in Product.objects.select_related(
                "category_master",
                "brochure_settings",
            ).filter(id__in=product_ids)
        }

        rows = []
        warnings = []
        with transaction.atomic():
            for product_id in product_ids:
                product = products.get(product_id)
                if product is None:
                    continue
                settings_row, _ = _get_or_create_safe_settings(product)
                settings_row = _apply_settings_updates(settings_row, updates)
                product.brochure_settings = settings_row
                row_warnings = brochure_settings_warnings(product, settings_row)
                rows.append(serialize_product_brochure_settings(product, request))
                warnings.extend(
                    {"product_id": product.id, "message": message}
                    for message in row_warnings
                )

        return Response(
            {
                "updated_count": len(rows),
                "skipped_count": len(product_ids) - len(rows),
                "rows": rows,
                "warnings": warnings,
            }
        )


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
