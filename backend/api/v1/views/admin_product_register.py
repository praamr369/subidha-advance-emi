from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_resources import ProductAdminSerializer
from api.v1.pagination import get_page_params
from subscriptions.enums import ProductItemType
from subscriptions.models import Product
from products_core.models import ProductVariant
import json

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
    item_type = _normalize(request.query_params.get("item_type")).upper()
    stock_type = _normalize(request.query_params.get("stock_type")).upper()

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

    if item_type:
        queryset = queryset.filter(item_type=item_type)

    if stock_type:
        queryset = queryset.filter(stock_type=stock_type)

    # By default, exclude products that are PIM variant SKUs (managed via base product).
    # Pass exclude_variant_skus=false to show them.
    exclude_variants_param = _normalize(request.query_params.get("exclude_variant_skus", "true")).lower()
    if exclude_variants_param not in {"false", "0", "no"}:
        queryset = queryset.filter(pim_variant__isnull=True)

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

    # Per-item-type counts — every type key is always present (0 when absent) so
    # the frontend can render stable segmented tabs.
    item_type_counts = {choice.value: 0 for choice in ProductItemType}
    for row in queryset.values("item_type").annotate(c=Count("id")):
        key = row["item_type"] or ProductItemType.FINISHED_GOOD.value
        item_type_counts[key] = item_type_counts.get(key, 0) + row["c"]

    # Stock-tracking posture, read from the stored InventoryItem status so this
    # stays cheap (no per-item ledger aggregation on a register listing).
    stock_active = queryset.filter(
        inventory_profile__stock_tracking_status="STOCK_ACTIVE"
    ).count()
    stock_prepared_no_stock = queryset.filter(
        inventory_profile__stock_tracking_status="PREPARED_NO_STOCK"
    ).count()

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
        "item_type_counts": item_type_counts,
        "stock_active": stock_active,
        "stock_prepared_no_stock": stock_prepared_no_stock,
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


class AdminProductCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        """Create a new product with optional variants"""
        try:
            # Extract form data
            product_code = _normalize(request.data.get("product_code"))
            name = _normalize(request.data.get("name"))
            base_price = request.data.get("base_price", "")
            sku = _normalize(request.data.get("sku"))
            unit_of_measure = _normalize(request.data.get("unit_of_measure")) or "PCS"
            category = _normalize(request.data.get("category"))
            subcategory = _normalize(request.data.get("subcategory"))
            catalog_category = request.data.get("catalog_category")
            base_specs = request.data.get("base_specs", "{}")
            description = _normalize(request.data.get("description"))
            hsn_sac_code = _normalize(request.data.get("hsn_sac_code"))
            gst_rate = request.data.get("gst_rate")
            item_type = _normalize(request.data.get("item_type")) or "FINISHED_GOOD"
            stock_type = _normalize(request.data.get("stock_type")) or "STOCK_ITEM"
            is_active = request.data.get("is_active", "true").lower() in {"true", "1", "yes"}
            is_emi_enabled = request.data.get("is_emi_enabled", "false").lower() in {"true", "1", "yes"}
            is_rent_enabled = request.data.get("is_rent_enabled", "false").lower() in {"true", "1", "yes"}
            is_lease_enabled = request.data.get("is_lease_enabled", "false").lower() in {"true", "1", "yes"}
            is_direct_sale_enabled = request.data.get("is_direct_sale_enabled", "true").lower() in {"true", "1", "yes"}
            plan_type_default = request.data.get("plan_type_default", "EMI")
            warranty_enabled = request.data.get("warranty_enabled", "true").lower() in {"true", "1", "yes"}
            warranty_months_manufacturing = request.data.get("warranty_months_manufacturing")
            warranty_months_structural = request.data.get("warranty_months_structural")
            warranty_months_extended_max = request.data.get("warranty_months_extended_max")
            extended_warranty_cost_percentage = request.data.get("extended_warranty_cost_percentage")
            image = request.data.get("image")
            video = request.data.get("video")
            brand = _normalize(request.data.get("brand"))
            has_variants = request.data.get("has_variants", "false").lower() in {"true", "1", "yes"}
            variants_json = request.data.get("variants", "[]")

            # Validate required fields
            if not product_code:
                return Response({"error": "product_code is required"}, status=status.HTTP_400_BAD_REQUEST)
            if not name:
                return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)

            # Create product
            product_data = {
                "product_code": product_code,
                "name": name,
                "brand": brand or "",
                "base_price": Decimal(base_price or "0"),
                "sku": sku,
                "unit_of_measure": unit_of_measure,
                "category": category,
                "subcategory": subcategory,
                "description": description,
                "hsn_sac_code": hsn_sac_code,
                "item_type": item_type,
                "stock_type": stock_type,
                "is_active": is_active,
                "is_emi_enabled": is_emi_enabled and item_type == "FINISHED_GOOD",
                "is_rent_enabled": is_rent_enabled and item_type == "FINISHED_GOOD",
                "is_lease_enabled": is_lease_enabled and item_type == "FINISHED_GOOD",
                "is_direct_sale_enabled": is_direct_sale_enabled and item_type in {"FINISHED_GOOD", "ADD_ON", "ACCESSORY"},
                "plan_type_default": plan_type_default,
                "warranty_enabled": warranty_enabled,
            }

            if gst_rate:
                try:
                    product_data["gst_rate"] = Decimal(gst_rate)
                except:
                    pass

            if base_specs and isinstance(base_specs, str):
                try:
                    product_data["base_specs"] = json.loads(base_specs)
                except:
                    product_data["base_specs"] = {}

            if warranty_months_manufacturing:
                product_data["warranty_months_manufacturing"] = int(warranty_months_manufacturing)
            if warranty_months_structural:
                product_data["warranty_months_structural"] = int(warranty_months_structural)
            if warranty_months_extended_max:
                product_data["warranty_months_extended_max"] = int(warranty_months_extended_max)
            if extended_warranty_cost_percentage:
                product_data["extended_warranty_cost_percentage"] = Decimal(extended_warranty_cost_percentage)

            if image:
                product_data["image"] = image

            if video:
                product_data["video"] = video

            product = Product.objects.create(**product_data)

            # Assign explicit PIM category if provided (signal auto-creates PimProduct)
            if catalog_category:
                from products_pim.models import PimProduct
                pim_product = PimProduct.objects.filter(source_product=product).first()
                if pim_product:
                    pim_product.category_id = int(catalog_category)
                    pim_product.save(update_fields=["category"])

            # Create variants if provided
            if has_variants and variants_json:
                try:
                    variants_list = json.loads(variants_json)
                    for variant_data in variants_list:
                        ProductVariant.objects.create(
                            product=product,
                            variant_code=variant_data.get("variant_code", ""),
                            variant_name=variant_data.get("variant_name", ""),
                            sku=variant_data.get("sku"),
                            barcode=variant_data.get("barcode"),
                            variant_price=Decimal(variant_data.get("variant_price")) if variant_data.get("variant_price") else None,
                            is_active=variant_data.get("is_active", True),
                        )
                except (json.JSONDecodeError, ValueError):
                    pass  # Continue without variants if JSON parsing fails

            # Serialize response
            serializer = ProductAdminSerializer(product, context={"request": request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
