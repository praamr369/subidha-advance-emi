from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Prefetch

from accounting.models import Vendor, VendorQuote, VendorProduct

ROUTES_VENDOR_QUOTES = "/admin/vendors/quotes"

# Contribution caps (must sum to 100 for intuitive "percent-style" totals).
WT_LOCATION_MAX = Decimal("30")
WT_PRICE_MAX = Decimal("20")
WT_DELIVERY_MAX = Decimal("15")
WT_QUALITY_MAX = Decimal("15")
WT_WARRANTY_MAX = Decimal("10")
WT_RELIABILITY_MAX = Decimal("10")

# When service area yields no hierarchical match but include_out_of_area=True.
WT_LOCATION_OUT_OF_AREA = Decimal("4")


def _dec(val) -> Decimal:
    try:
        if val is None:
            return Decimal("0")
        return Decimal(str(val))
    except Exception:
        return Decimal("0")


def _normalize_vendor_score(raw, *, max_pts: Decimal) -> Decimal:
    """Map vendor profile score (typically 0–100) into [0, max_pts]; null-safe."""
    if raw is None:
        return Decimal("0")
    v = _dec(raw)
    if v <= Decimal("0"):
        return Decimal("0")
    capped = min(v, Decimal("100"))
    return (capped / Decimal("100")) * max_pts


def _location_tier_points(
    *,
    same_pincode: bool,
    same_city: bool,
    same_district: bool,
    same_state: bool,
    include_out_of_area: bool,
) -> tuple[Decimal, str, bool]:
    """
    Location contribution (max WT_LOCATION_MAX) and stable label.
    """
    if same_pincode:
        return WT_LOCATION_MAX, "SAME_PINCODE", True
    if same_city:
        return Decimal("24"), "SAME_CITY", True
    if same_district:
        return Decimal("16"), "SAME_DISTRICT", True
    if same_state:
        return Decimal("8"), "SAME_STATE", True

    # No hierarchical match inside declared areas (or vendor has areas but none matched geography).
    if include_out_of_area:
        return WT_LOCATION_OUT_OF_AREA, "OUT_OF_AREA", False
    return Decimal("0"), "OUT_OF_AREA", False


def _build_product_candidates(
    vendor: Vendor,
    *,
    product_id: int | None,
    category_text_up: str,
    product_name: str,
    material_q: str,
):
    pq = VendorProduct.objects.filter(vendor_id=vendor.id, active=True)
    if product_id is not None:
        pq = pq.filter(internal_product_id=product_id)
    if category_text_up:
        pq = pq.filter(category_text__iexact=category_text_up)
    if product_name:
        pq = pq.filter(product_name__icontains=product_name.strip())
    if material_q:
        pq = pq.filter(material__icontains=material_q.strip())
    return pq.order_by("product_name", "id")[:12]


def _filters_active(
    *,
    product_id: int | None,
    category_text_up: str,
    product_name: str,
    material_q: str,
) -> bool:
    # Product-name free text is treated as a soft hint only; hard filtering is
    # applied only when structured procurement filters are provided.
    return bool(product_id is not None or category_text_up or (material_q and material_q.strip()))


def suggest_vendors_for_order(
    *,
    customer_pincode: str = "",
    customer_city: str = "",
    customer_district: str = "",
    customer_state: str = "",
    customer_branch: str = "",
    product_id: int | None = None,
    category_text: str = "",
    product_name: str = "",
    material: str = "",
    quantity: Decimal | None = None,
    required_by=None,
    budget_amount: Decimal | None = None,
    include_out_of_area: bool = False,
) -> list[dict[str, Any]]:
    """
    Rank ACTIVE vendors for read-only sourcing. Never creates procurement or accounting artefacts.

    ``customer_branch`` is accepted for future branch-aware rules; currently informational only (logged in score meta).

    Quantity / budget / required_by are echoed for UI context only (no transactional side effects).
    """
    branch_hint = (customer_branch or "").strip()

    category_text_up = (category_text or "").strip().upper()
    material_q = (material or "").strip()
    filters_on = _filters_active(
        product_id=product_id,
        category_text_up=category_text_up,
        product_name=product_name,
        material_q=material_q,
    )

    qs = (
        Vendor.objects.filter(status="ACTIVE", is_active=True)
        .prefetch_related("service_areas", "categories", Prefetch("products", queryset=VendorProduct.objects.filter(active=True)))
        .prefetch_related("addresses")
    )

    rows: list[dict[str, Any]] = []

    pin_in = (customer_pincode or "").strip()
    city_in = (customer_city or "").strip().lower()
    dist_in = (customer_district or "").strip().lower()
    state_in = (customer_state or "").strip().lower()

    for vendor in qs:
        areas = [a for a in vendor.service_areas.all() if getattr(a, "is_active", True)]
        same_pincode = same_city = same_district = same_state = False
        for area in areas:
            if pin_in and (area.pincode or "").strip() == pin_in:
                same_pincode = True
            if city_in and (area.city or "").strip().lower() == city_in:
                same_city = True
            if dist_in and (area.district or "").strip().lower() == dist_in:
                same_district = True
            if state_in and (area.state or "").strip().lower() == state_in:
                same_state = True

        in_service_geo = same_pincode or same_city or same_district or same_state or len(areas) == 0
        location_pts, location_level, svc_match = _location_tier_points(
            same_pincode=same_pincode,
            same_city=same_city,
            same_district=same_district,
            same_state=same_state,
            include_out_of_area=include_out_of_area,
        )

        if not in_service_geo and not include_out_of_area:
            continue

        pq = _build_product_candidates(
            vendor,
            product_id=product_id,
            category_text_up=category_text_up,
            product_name=product_name.strip() if product_name else "",
            material_q=material_q,
        )

        matched = list(pq)
        has_product_match = len(matched) > 0

        if filters_on and not has_product_match:
            continue

        contrib_loc = location_pts
        contrib_price = _normalize_vendor_score(getattr(vendor, "price_score", None), max_pts=WT_PRICE_MAX)
        contrib_quality = _normalize_vendor_score(getattr(vendor, "quality_score", None), max_pts=WT_QUALITY_MAX)
        contrib_delivery = _normalize_vendor_score(getattr(vendor, "delivery_score", None), max_pts=WT_DELIVERY_MAX)
        contrib_warranty = _normalize_vendor_score(getattr(vendor, "warranty_score", None), max_pts=WT_WARRANTY_MAX)
        contrib_reliability = _normalize_vendor_score(getattr(vendor, "rating", None), max_pts=WT_RELIABILITY_MAX)

        weighted_core = contrib_price + contrib_quality + contrib_delivery + contrib_warranty + contrib_reliability
        overall_score = contrib_loc + weighted_core

        if location_level == "OUT_OF_AREA" and include_out_of_area:
            reason = "Outside declared service footprints—included via include_out_of_area flag"
        elif has_product_match and svc_match:
            reason = "Service area aligns and catalog intersects procurement filters"
        elif has_product_match:
            reason = "Catalog intersects procurement filters"
        elif svc_match:
            reason = "Service footprint covers delivery geography"
        else:
            reason = "Operational fallback candidate"

        latest_quote = (
            VendorQuote.objects.filter(vendor=vendor)
            .order_by("-created_at")
            .values("id", "quoted_price", "lead_time_days", "status", "valid_until")
            .first()
        )

        primary_address = vendor.addresses.filter(is_primary=True).values("city", "district", "state", "pincode").first()
        if not primary_address:
            primary_address = vendor.addresses.all().values("city", "district", "state", "pincode").first()

        category_match_label = "YES" if (category_text_up and has_product_match) else ("N/A" if not category_text_up else "PARTIAL")

        matching_products_payload = [
            {
                "id": p.id,
                "product_name": p.product_name,
                "vendor_sku": p.vendor_sku or "",
                "category_text": p.category_text or "",
                "material": p.material or "",
                "base_quote_price": str(p.base_quote_price),
                "lead_time_days": p.lead_time_days,
            }
            for p in matched[:10]
        ]

        vid = vendor.id
        rows.append(
            {
                "vendor_id": vid,
                "vendor_name": vendor.display_name or vendor.name,
                "categories": list(vendor.categories.values_list("code", flat=True)),
                "primary_address": primary_address or {},
                "location_match_level": location_level,
                "distance_or_location_match": location_level.replace("SAME_", "") if location_level.startswith("SAME_") else location_level,
                "service_area_match": svc_match,
                "category_match_indicator": category_match_label,
                "price_score": str(_dec(vendor.price_score)),
                "quality_score": str(_dec(vendor.quality_score)),
                "delivery_score": str(_dec(vendor.delivery_score)),
                "warranty_score": str(_dec(vendor.warranty_score)),
                "reliability_score": str(_dec(vendor.rating)),
                "overall_score": str(overall_score.quantize(Decimal("0.01"))),
                "score_breakdown": {
                    "location": str(contrib_loc.quantize(Decimal("0.01"))),
                    "price_band": str(contrib_price.quantize(Decimal("0.01"))),
                    "quality": str(contrib_quality.quantize(Decimal("0.01"))),
                    "delivery": str(contrib_delivery.quantize(Decimal("0.01"))),
                    "warranty": str(contrib_warranty.quantize(Decimal("0.01"))),
                    "reliability": str(contrib_reliability.quantize(Decimal("0.01"))),
                    "catalog_filters_match": filters_on,
                },
                "suggested_reason": reason,
                "matching_products": matching_products_payload,
                "latest_quote": latest_quote,
                "actions": {
                    "request_quote": f"/admin/vendors/quotes?prefill_vendor={vid}",
                    "open_vendor": f"/admin/vendors/{vid}",
                    "compare_quotes": ROUTES_VENDOR_QUOTES,
                },
                "context_echo": {
                    "quantity": str(quantity) if quantity is not None else "",
                    "required_by": required_by.isoformat() if hasattr(required_by, "isoformat") else (str(required_by) if required_by else ""),
                    "budget_amount": str(budget_amount) if budget_amount is not None else "",
                    "branch_hint": branch_hint,
                },
            }
        )

    rows.sort(key=lambda item: Decimal(str(item["overall_score"])), reverse=True)
    return rows
