"""Role-aware product catalog browsing.

A single source of truth for "what products can a portal user see, and for
which business purpose". The admin registers/activates products and toggles the
per-mode purpose flags (EMI / Rent / Lease / Direct Sale). Portal roles
(customer, partner, vendor) all read from the same approved catalog through the
helpers below so the three dashboards stay in sync.

This module is intentionally additive and read-only — it never mutates catalog
data. It reuses the existing ``Product`` purpose flags rather than introducing a
new approval model, so "admin approved" == ``is_active=True``.
"""
from __future__ import annotations

from dataclasses import dataclass

from django.db.models import QuerySet, Q

from subscriptions.models import Product


# Canonical catalog purposes exposed to portal roles. Ordered for display.
PURPOSE_EMI = "emi"
PURPOSE_RENT = "rent"
PURPOSE_LEASE = "lease"
PURPOSE_DIRECT_SALE = "direct_sale"
PURPOSE_PURCHASE_REQUEST = "purchase_request"


@dataclass(frozen=True)
class PurposeSpec:
    key: str
    label: str
    # Attribute on Product that enables this purpose. ``None`` means the purpose
    # is available for every approved product (e.g. a generic purchase enquiry).
    flag_field: str | None


PURPOSE_SPECS: tuple[PurposeSpec, ...] = (
    PurposeSpec(PURPOSE_EMI, "EMI Plan", "is_emi_enabled"),
    PurposeSpec(PURPOSE_RENT, "Rent", "is_rent_enabled"),
    PurposeSpec(PURPOSE_LEASE, "Lease", "is_lease_enabled"),
    PurposeSpec(PURPOSE_DIRECT_SALE, "Direct Sale", "is_direct_sale_enabled"),
    PurposeSpec(PURPOSE_PURCHASE_REQUEST, "Purchase Request", None),
)

PURPOSE_BY_KEY: dict[str, PurposeSpec] = {spec.key: spec for spec in PURPOSE_SPECS}


def approved_catalog_queryset() -> QuerySet[Product]:
    """Products that admin has approved (activated) for portal visibility.

    Business rule: customer/partner/vendor portals may only see sellable
    finished goods. Products whose inventory item is a RAW_MATERIAL or
    ACCESSORY are internal (manufacturing/BOM inputs) and stay admin-only.
    Products without an inventory item are treated as finished goods.
    """
    return (
        Product.objects.filter(Q(is_active=True) & (Q(pim__isnull=True) | Q(pim__is_published=True)))
        .exclude(lifecycle_status="DISCONTINUED")
        .exclude(inventory_profile__stock_item_type__in=["RAW_MATERIAL", "ACCESSORY"])
        .select_related("category_master", "subcategory_master")
        .distinct()
        .order_by("category", "name", "id")
    )


def _purpose_flag_enabled(product: Product, spec: PurposeSpec) -> bool:
    if spec.flag_field is None:
        # Generic purpose (purchase request) — available for any approved product.
        return True
    return bool(getattr(product, spec.flag_field, False))


def product_purposes(product: Product) -> list[dict]:
    """Return the ordered purpose descriptors enabled for a product."""
    return [
        {"key": spec.key, "label": spec.label}
        for spec in PURPOSE_SPECS
        if _purpose_flag_enabled(product, spec)
    ]


def filter_catalog(
    queryset: QuerySet[Product],
    *,
    purpose: str | None = None,
    category: str | None = None,
    search: str | None = None,
) -> QuerySet[Product]:
    """Apply portal-facing filters to an approved-catalog queryset."""
    from django.db.models import Q

    purpose_key = (purpose or "").strip().lower()
    if purpose_key and purpose_key in PURPOSE_BY_KEY:
        spec = PURPOSE_BY_KEY[purpose_key]
        if spec.flag_field is not None:
            queryset = queryset.filter(**{spec.flag_field: True})
        # purchase_request applies to every approved product — no extra filter.

    category_value = (category or "").strip()
    if category_value:
        queryset = queryset.filter(category__iexact=category_value)

    search_value = (search or "").strip()
    if search_value:
        queryset = queryset.filter(
            Q(name__icontains=search_value)
            | Q(product_code__icontains=search_value)
            | Q(sku__icontains=search_value)
            | Q(category__icontains=search_value)
            | Q(subcategory__icontains=search_value)
            | Q(description__icontains=search_value)
            | Q(base_specs__icontains=search_value)
        )

    return queryset


def _resolve_catalog_image(product: Product, request=None) -> str | None:
    from api.v1.serializers.media import serialize_media_url
    own_v = getattr(product, "pim_variant", None)
    if own_v and getattr(own_v, "image", None):
        return serialize_media_url(request, own_v.image)
    if getattr(product, "image", None):
        return serialize_media_url(request, product.image)
    try:
        from products_pim.models import ProductMediaItem
        from django.db.models import Q
        pim = product.pim.first()
        if pim:
            base_pim = pim.parent if pim.parent_id else pim
            qs = ProductMediaItem.objects.filter(product=base_pim, kind="IMAGE")
            if pim.parent_id and own_v:
                qs = qs.filter(Q(scope="ALL_VARIANTS") | Q(scope="VARIANT", variant=own_v))
            else:
                qs = qs.filter(scope="ALL_VARIANTS")
            item = qs.order_by("-is_hero", "display_order", "-created_at").first()
            if item and item.file:
                return serialize_media_url(request, item.file)
    except Exception:
        pass
    return None

def _resolve_catalog_media(product: Product, request=None) -> list[dict]:
    from api.v1.serializers.media import serialize_media_url
    media = []
    own_v = getattr(product, "pim_variant", None)
    
    try:
        from products_pim.models import ProductMediaItem
        from django.db.models import Q
        pim = product.pim.first()
        if pim:
            base_pim = pim.parent if pim.parent_id else pim
            qs = ProductMediaItem.objects.filter(product=base_pim)
            if pim.parent_id and own_v:
                qs = qs.filter(Q(scope="ALL_VARIANTS") | Q(scope="VARIANT", variant=own_v))
            else:
                qs = qs.filter(scope="ALL_VARIANTS")
            
            for item in qs.order_by("-is_hero", "display_order", "-created_at"):
                if item.file:
                    media.append({
                        "url": serialize_media_url(request, item.file),
                        "kind": item.kind,
                        "is_hero": item.is_hero,
                        "title": item.title or product.name
                    })
    except Exception:
        pass
        
    if not media:
        if own_v and getattr(own_v, "image", None):
            media.append({
                "url": serialize_media_url(request, own_v.image),
                "kind": "IMAGE",
                "is_hero": True,
                "title": product.name
            })
        elif getattr(product, "image", None):
            media.append({
                "url": serialize_media_url(request, product.image),
                "kind": "IMAGE",
                "is_hero": True,
                "title": product.name
            })
            
    return media

def serialize_catalog_product(product: Product, request=None) -> dict:
    """Serialize a product for the portal catalog grid."""
    return {
        "id": product.id,
        "product_code": product.product_code,
        "name": product.name,
        "description": product.description or "",
        "category": product.category or "",
        "subcategory": product.subcategory or "",
        "base_price": str(product.base_price),
        "unit_of_measure": product.unit_of_measure or "PCS",
        "gst_rate": str(product.gst_rate) if product.gst_rate is not None else None,
        "hsn_sac_code": product.hsn_sac_code or "",
        "lifecycle_status": product.lifecycle_status,
        "image": _resolve_catalog_image(product, request),
        "purposes": product_purposes(product),
        "flags": {
            "emi": bool(product.is_emi_enabled),
            "rent": bool(product.is_rent_enabled),
            "lease": bool(product.is_lease_enabled),
            "direct_sale": bool(product.is_direct_sale_enabled),
        },
        "default_plan_type": product.plan_type_default,
    }


def serialize_catalog_product_detail(product: Product, request=None) -> dict:
    """Serialize a product with full details for the PDP (Product Detail Page)."""
    base = serialize_catalog_product(product, request)
    base.update({
        "base_specs": product.base_specs or {},
        "warranty_enabled": bool(product.warranty_enabled),
        "warranty_months_manufacturing": product.warranty_months_manufacturing,
        "warranty_months_structural": product.warranty_months_structural,
        "warranty_months_extended_max": product.warranty_months_extended_max,
        "extended_warranty_cost_percentage": str(product.extended_warranty_cost_percentage),
        "sku": product.sku or "",
        "ar_model": _ar_model(product, request),
        "media_items": _resolve_catalog_media(product, request),
    })
    return base


def _ar_model(product: Product, request) -> dict | None:
    """"View in your room" model for the portal PDP; fail-soft so AR never breaks the page."""
    from products_pim.services.ar_service import resolve_ar_model

    try:
        return resolve_ar_model(product, request)
    except Exception:  # noqa: BLE001
        return None


def catalog_categories(queryset: QuerySet[Product]) -> list[dict]:
    """Distinct categories present in an approved-catalog queryset with counts."""
    from django.db.models import Count

    rows = (
        queryset.exclude(category="")
        .values("category")
        .annotate(count=Count("id"))
        .order_by("category")
    )
    return [{"name": row["category"], "count": row["count"]} for row in rows]


def purpose_catalog_summary(queryset: QuerySet[Product]) -> list[dict]:
    """Count of approved products available for each purpose (for filter chips)."""
    products = list(queryset)
    summary: list[dict] = []
    for spec in PURPOSE_SPECS:
        count = sum(1 for product in products if _purpose_flag_enabled(product, spec))
        summary.append({"key": spec.key, "label": spec.label, "count": count})
    return summary
