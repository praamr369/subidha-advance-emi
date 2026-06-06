from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Q, Sum
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import ProductAdminSerializer
from api.v1.pagination import get_page_params
from subscriptions.models import Product

PAGE_SIZE_OPTIONS = {20, 50, 100}


def _normalize(value: Any) -> str:
    return str(value or "").strip()


def _bool_param(value: str) -> bool | None:
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes", "active"}:
        return True
    if normalized in {"false", "0", "no", "inactive"}:
        return False
    return None


def _has_image_q() -> Q:
    return Q(image__isnull=False) & ~Q(image="")


def _cataloged_q() -> Q:
    return Q(category__isnull=False) & ~Q(category="") | Q(subcategory__isnull=False) & ~Q(subcategory="") | Q(category_master__isnull=False) | Q(subcategory_master__isnull=False)


def _base_queryset():
    return Product.objects.select_related(
        "category_master",
        "subcategory_master",
        "unit_of_measure_master",
        "inventory_profile",
    ).all().order_by("name", "id")


def _apply_filters(queryset, request):
    q = _normalize(request.query_params.get("q") or request.query_params.get("search"))
    category = _normalize(request.query_params.get("category"))
    subcategory = _normalize(request.query_params.get("subcategory"))
    inventory = _normalize(request.query_params.get("inventory") or request.query_params.get("inventory_readiness")).upper()
    image_status = _normalize(request.query_params.get("image_status")).upper()
    active_status = _normalize(request.query_params.get("active") or request.query_params.get("is_active"))
    capability = _normalize(request.query_params.get("capability")).upper()
    readiness = _normalize(request.query_params.get("readiness")).upper()

    if q:
        query = (
            Q(name__icontains=q)
            | Q(product_code__icontains=q)
            | Q(sku__icontains=q)
            | Q(unit_of_measure__icontains=q)
            | Q(category__icontains=q)
            | Q(subcategory__icontains=q)
            | Q(category_master__name__icontains=q)
            | Q(subcategory_master__name__icontains=q)
            | Q(description__icontains=q)
        )
        if q.isdigit():
            query |= Q(id=int(q))
        queryset = queryset.filter(query).distinct()

    if category:
        category_filter = Q(category__icontains=category) | Q(category_master__name__icontains=category)
        if category.isdigit():
            category_filter |= Q(category_master_id=int(category))
        queryset = queryset.filter(category_filter)

    if subcategory:
        subcategory_filter = Q(subcategory__icontains=subcategory) | Q(subcategory_master__name__icontains=subcategory)
        if subcategory.isdigit():
            subcategory_filter |= Q(subcategory_master_id=int(subcategory))
        queryset = queryset.filter(subcategory_filter)

    active = _bool_param(active_status)
    if active is not None:
        queryset = queryset.filter(is_active=active)

    if inventory in {"READY", "INVENTORY_READY", "TRUE"}:
        queryset = queryset.filter(inventory_profile__isnull=False)
    elif inventory in {"PENDING", "STOCK_PROFILE_PENDING", "FALSE"}:
        queryset = queryset.filter(inventory_profile__isnull=True)

    if image_status in {"HAS_IMAGE", "IMAGE_READY", "AVAILABLE"}:
        queryset = queryset.filter(_has_image_q())
    elif image_status in {"NO_IMAGE", "MISSING", "NOT_PROVIDED"}:
        queryset = queryset.exclude(_has_image_q())

    if capability == "EMI":
        queryset = queryset.filter(is_emi_enabled=True)
    elif capability == "RENT":
        queryset = queryset.filter(is_rent_enabled=True)
    elif capability == "LEASE":
        queryset = queryset.filter(is_lease_enabled=True)
    elif capability in {"DIRECT_SALE", "DIRECTSALE"}:
        queryset = queryset.filter(is_direct_sale_enabled=True)

    if readiness in {"CATALOGED", "CATALOG_READY"}:
        queryset = queryset.filter(_cataloged_q())
    elif readiness in {"CATALOG_CLEANUP", "CATALOG_PENDING"}:
        queryset = queryset.exclude(_cataloged_q())
    elif readiness == "SKU_PENDING":
        queryset = queryset.filter(Q(sku__isnull=True) | Q(sku=""))
    elif readiness in {"NO_IMAGE", "IMAGE_MISSING"}:
        queryset = queryset.exclude(_has_image_q())
    elif readiness in {"INVENTORY_READY", "READY_INVENTORY"}:
        queryset = queryset.filter(inventory_profile__isnull=False)
    elif readiness in {"STOCK_PROFILE_PENDING", "INVENTORY_PENDING"}:
        queryset = queryset.filter(inventory_profile__isnull=True)
    elif readiness == "SUBSCRIPTION_READY":
        queryset = queryset.filter(is_active=True, is_emi_enabled=True, base_price__gt=Decimal("0.00"))
    elif readiness == "DIRECT_SALE_READY":
        queryset = queryset.filter(is_active=True, is_direct_sale_enabled=True, base_price__gt=Decimal("0.00"))
    elif readiness in {"RENT_LEASE_READY", "RENTLEASE_READY"}:
        queryset = queryset.filter(Q(is_rent_enabled=True) | Q(is_lease_enabled=True))

    return queryset.distinct()


def _summary(queryset) -> dict[str, Any]:
    count = queryset.count()
    inventory_ready = queryset.filter(inventory_profile__isnull=False).count()
    image_ready = queryset.filter(_has_image_q()).count()
    cataloged = queryset.filter(_cataloged_q()).count()
    subscription_ready = queryset.filter(is_active=True, is_emi_enabled=True, base_price__gt=Decimal("0.00")).count()
    direct_sale_ready = queryset.filter(is_active=True, is_direct_sale_enabled=True, base_price__gt=Decimal("0.00")).count()
    rent_lease_ready = queryset.filter(Q(is_rent_enabled=True) | Q(is_lease_enabled=True)).count()
    base_value = queryset.aggregate(total=Sum("base_price"))["total"] or Decimal("0.00")
    return {
        "total_products": count,
        "inventory_ready": inventory_ready,
        "stock_profile_pending": max(count - inventory_ready, 0),
        "subscription_ready": subscription_ready,
        "direct_sale_ready": direct_sale_ready,
        "rent_lease_ready": rent_lease_ready,
        "image_missing": max(count - image_ready, 0),
        "catalog_cleanup_required": max(count - cataloged, 0),
        "total_base_value": str(base_value),
    }


class AdminProductRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = _apply_filters(_base_queryset(), request)
        page, requested_page_size = get_page_params(request, default_page_size=50)
        page_size = requested_page_size if requested_page_size in PAGE_SIZE_OPTIONS else 50
        count = queryset.count()
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        page_rows = list(queryset[start_index:end_index]) if start_index < count else []
        serializer = ProductAdminSerializer(page_rows, many=True, context={"request": request})
        num_pages = (count + page_size - 1) // page_size if count else 0
        return Response(
            {
                "count": count,
                "total_count": count,
                "catalog_total_count": Product.objects.count(),
                "page": page,
                "page_size": page_size,
                "page_size_options": sorted(PAGE_SIZE_OPTIONS),
                "num_pages": num_pages,
                "has_next": page < num_pages,
                "has_previous": page > 1 and num_pages > 0,
                "range_start": start_index + 1 if page_rows else 0,
                "range_end": start_index + len(page_rows) if page_rows else 0,
                "summary": _summary(queryset),
                "results": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
