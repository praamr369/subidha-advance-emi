"""
Stock on Hand Enterprise Service

InventoryLot → inventory_item (InventoryItem) → product (Product)
Key field corrections vs. old service:
  - InventoryLot.quantity        → quantity_on_hand
  - InventoryLot.product_id      → inventory_item__product_id
  - Product.inventory_status     → InventoryItem.is_active
  - Product.reorder_point        → InventoryItem.reorder_level_qty
"""

from decimal import Decimal
import json

from django.db.models import Case, Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value, When
from django.db.models.functions import Coalesce

from inventory.models import InventoryItem, SOFT_HOLD_MOVEMENT_TYPES, StockLedger, StockLocation, StockMovementType
from inventory.services.stock_service import attach_bulk_stock_quantities

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")
_SOFT_HOLDS = list(SOFT_HOLD_MOVEMENT_TYPES)


def _annotate_stock_qty(qs, location_id: int | None = None):
    """Annotate queryset with physical_qty = opening + sum(in) - sum(out), excluding soft-holds."""
    ledger_filter = ~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)
    if location_id is not None:
        ledger_filter &= Q(stock_ledger__stock_location_id=location_id)
        opening_expr = Case(
            When(
                default_stock_location_id=location_id,
                then=Coalesce(F("opening_stock_qty"), Value(QUANTITY_ZERO), output_field=DecimalField()),
            ),
            default=Value(QUANTITY_ZERO),
            output_field=DecimalField(),
        )
    else:
        opening_expr = Coalesce(F("opening_stock_qty"), Value(QUANTITY_ZERO), output_field=DecimalField())

    return qs.annotate(
        _ledger_in=Coalesce(
            Sum("stock_ledger__quantity_in", filter=ledger_filter),
            Value(QUANTITY_ZERO),
            output_field=DecimalField(),
        ),
        _ledger_out=Coalesce(
            Sum("stock_ledger__quantity_out", filter=ledger_filter),
            Value(QUANTITY_ZERO),
            output_field=DecimalField(),
        ),
    ).annotate(
        physical_qty=ExpressionWrapper(
            opening_expr + F("_ledger_in") - F("_ledger_out"),
            output_field=DecimalField(),
        )
    )

def _critical_qs():
    """
    InventoryItems whose total physical quantity ≤ reorder_level_qty.
    Returns an annotated queryset ordered worst-first.
    """
    qs = InventoryItem.objects.filter(is_active=True)
    qs = _annotate_stock_qty(qs)
    return (
        qs.filter(physical_qty__lte=F("reorder_level_qty"))
        .select_related("product")
        .order_by(F("reorder_level_qty") - F("physical_qty"))  # worst shortage first
    )


def build_stock_on_hand_summary():
    """
    KPI summary + full critical-shortage list for the warehouse command room.
    """
    # Total physical stock across all active items
    qs = InventoryItem.objects.filter(is_active=True)
    qs = _annotate_stock_qty(qs)

    value_qs = qs.values("id", "standard_unit_cost", "physical_qty")

    # Live soft reservations via SALE_RESERVE minus SALE_RELEASE per item
    res_items = (
        StockLedger.objects.filter(
            inventory_item__is_active=True,
            movement_type__in=[StockMovementType.SALE_RESERVE, StockMovementType.SALE_RELEASE],
        )
        .values("inventory_item_id")
        .annotate(
            r_in=Sum("quantity_in"),
            r_out=Sum("quantity_out"),
        )
    )
    res_map = {
        row["inventory_item_id"]: max(
            Decimal("0"),
            Decimal(str(row["r_in"] or 0)) - Decimal(str(row["r_out"] or 0)),
        )
        for row in res_items
    }

    total_physical = Decimal("0")
    total_value = Decimal("0")
    total_reserved = sum(res_map.values(), Decimal("0"))
    total_available = Decimal("0")

    for row in value_qs:
        item_id = row["id"]
        qty = row["physical_qty"] or Decimal("0")
        res = res_map.get(item_id, Decimal("0"))
        avail = max(Decimal("0"), qty - res)

        total_physical += qty
        total_available += avail

        if qty > 0:
            cost = row["standard_unit_cost"] or Decimal("0")
            total_value += cost * qty

    # Critical shortages list with attached ATP quantities
    critical_items = list(_critical_qs())
    attach_bulk_stock_quantities(critical_items)
    critical_shortages = []
    for item in critical_items:
        shortage = (item.reorder_level_qty or Decimal("0")) - item.physical_qty
        critical_shortages.append(
            {
                "product_id": item.product_id,
                "product_code": item.product.product_code if item.product else "",
                "product_name": item.product.name if item.product else item.inventory_code,
                "sku": item.sku or "",
                "physical_qty": str(item.physical_qty),
                "reserved_qty": str(item.reserved_qty()),
                "available_qty": str(item.available_qty()),
                "reorder_point": str(item.reorder_level_qty or Decimal("0")),
                "shortage_qty": str(shortage),
            }
        )

    return {
        "summary": {
            "total_physical_qty": str(total_physical),
            "total_reserved_qty": str(total_reserved),
            "total_available_qty": str(total_available),
            "critical_shortage_count": len(critical_shortages),
            "total_value": str(total_value),
        },
        "critical_shortages": critical_shortages,
    }


def get_critical_shortages(page: int = 1, page_size: int = 50):
    """
    Paginated critical shortages for the workbench table.
    """
    qs = _critical_qs()
    total_count = qs.count()
    num_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 0
    page = max(1, min(page, num_pages)) if num_pages else 1
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])
    attach_bulk_stock_quantities(items)

    results = []
    for item in items:
        shortage = (item.reorder_level_qty or Decimal("0")) - item.physical_qty
        results.append(
            {
                "product_id": item.product_id,
                "product_code": item.product.product_code if item.product else "",
                "product_name": item.product.name if item.product else item.inventory_code,
                "sku": item.sku or "",
                "physical_qty": str(item.physical_qty),
                "reserved_qty": str(item.reserved_qty()),
                "available_qty": str(item.available_qty()),
                "reorder_point": str(item.reorder_level_qty or Decimal("0")),
                "shortage_qty": str(shortage),
            }
        )

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "results": results,
    }


def _format_attr_value(val_obj) -> str:
    """Format a ProductAttribute or VariantAttributeValue cleanly."""
    text_val = (getattr(val_obj, "value_text", "") or "").strip()
    if text_val:
        return text_val
    num_val = getattr(val_obj, "value_number", None)
    if num_val is not None:
        num_str = str(num_val)
        return num_str.rstrip("0").rstrip(".") if "." in num_str else num_str
    bool_val = getattr(val_obj, "value_boolean", None)
    if bool_val is not None:
        return "Yes" if bool_val else "No"
    date_val = getattr(val_obj, "value_date", None)
    if date_val is not None:
        return str(date_val)
    return ""


def _resolve_pim_product(prod):
    """Return linked PimProduct for an operational Product without extra queries if prefetched."""
    if not prod:
        return None
    pim_var = getattr(prod, "pim_variant", None)
    if pim_var and getattr(pim_var, "product_id", None):
        return pim_var.product
    try:
        pim_list = list(prod.pim.all())
        return pim_list[0] if pim_list else None
    except Exception:
        return None


def _resolve_category_and_subcategory(item: InventoryItem) -> tuple[str, str]:
    """Resolve canonical Category and Subcategory names across Product, Master, and PIM."""
    prod = getattr(item, "product", None)
    if not prod:
        return "Uncategorized", ""

    cat_name = (
        (getattr(prod, "category", "") or "").strip()
        or (getattr(getattr(prod, "category_master", None), "name", "") or "").strip()
    )
    subcat_name = (
        (getattr(prod, "subcategory", "") or "").strip()
        or (getattr(getattr(prod, "subcategory_master", None), "name", "") or "").strip()
    )

    if not cat_name or not subcat_name:
        pim_prod = _resolve_pim_product(prod)
        if pim_prod:
            if not cat_name and getattr(pim_prod, "category_id", None):
                cat_name = (getattr(pim_prod.category, "name", "") or "").strip()
            if not subcat_name and getattr(pim_prod, "subcategory_id", None):
                subcat_name = (getattr(pim_prod.subcategory, "name", "") or "").strip()

    return (cat_name or "Uncategorized"), subcat_name


def extract_inventory_item_attributes(item: InventoryItem) -> dict[str, str]:
    """
    Returns a normalized key-value dict of variant/product attributes for an inventory item,
    e.g. {"Size": "King", "Material": "Solid Wood", "Finish": "Teak Brown"}.
    Checks linked PIM variant attribute values, PIM product attributes, product base_specs,
    and accessory variant groups.
    """
    attrs: dict[str, str] = {}
    prod = getattr(item, "product", None)
    if not prod:
        return attrs

    # 1. PIM Variant Attributes
    pim_var = getattr(prod, "pim_variant", None)
    if pim_var:
        try:
            for val in pim_var.attribute_values.all():
                attr_name = (val.attribute.name or "").strip()
                text_val = _format_attr_value(val)
                if attr_name and text_val:
                    attrs[attr_name] = text_val
        except Exception:
            pass

    # 2. PIM Product Attributes (blueprint / standalone PIM product)
    pim_prod = _resolve_pim_product(prod)
    if pim_prod:
        try:
            for val in pim_prod.attributes.all():
                attr_name = (val.attribute.name or "").strip()
                text_val = _format_attr_value(val)
                if attr_name and attr_name not in attrs and text_val:
                    attrs[attr_name] = text_val
        except Exception:
            pass

    # 3. Product base_specs (as fallback or addition)
    if isinstance(prod.base_specs, dict):
        for k, v in prod.base_specs.items():
            clean_k = str(k).replace("_", " ").title().strip()
            if clean_k not in attrs and v is not None and str(v).strip():
                attrs[clean_k] = str(v).strip()

    # 4. Variant group / label (for accessories)
    vg = getattr(item, "variant_group", None) or getattr(item, "accessory_variant_group", None)
    if vg:
        attrs["Variant Group"] = getattr(vg, "name", str(vg))
    vlabel = (getattr(item, "variant_label", "") or "").strip()
    if vlabel and "Variant" not in attrs:
        attrs["Variant"] = vlabel

    return attrs


def _build_location_breakdown_map(item_ids: list[int]) -> dict[int, list[dict]]:
    """Precompute non-zero / active stock balances per StockLocation in a single query."""
    if not item_ids:
        return {}
    agg_rows = (
        StockLedger.objects.filter(inventory_item_id__in=item_ids)
        .exclude(movement_type__in=_SOFT_HOLDS)
        .values(
            "inventory_item_id",
            "stock_location_id",
            "stock_location__code",
            "stock_location__name",
            "stock_location__location_type",
        )
        .annotate(
            qty_in=Coalesce(Sum("quantity_in"), Value(QUANTITY_ZERO), output_field=DecimalField()),
            qty_out=Coalesce(Sum("quantity_out"), Value(QUANTITY_ZERO), output_field=DecimalField()),
        )
        .order_by("stock_location__name", "stock_location_id")
    )
    loc_map: dict[int, list[dict]] = {}
    for row in agg_rows:
        qty = Decimal(str(row["qty_in"] or 0)) - Decimal(str(row["qty_out"] or 0))
        if qty == QUANTITY_ZERO and not row["stock_location_id"]:
            continue
        loc_map.setdefault(row["inventory_item_id"], []).append({
            "location_id": row["stock_location_id"],
            "location_code": row["stock_location__code"] or "UNLOC",
            "location_name": row["stock_location__name"] or "Unassigned Location",
            "location_type": row["stock_location__location_type"] or "",
            "on_hand_qty": f"{qty:.3f}",
        })
    return loc_map


def _build_reserved_map(item_ids: list[int] | None = None, location_id: int | None = None) -> dict[int, Decimal]:
    qs = StockLedger.objects.filter(
        movement_type__in=[StockMovementType.SALE_RESERVE, StockMovementType.SALE_RELEASE],
    )
    if item_ids is not None:
        if not item_ids:
            return {}
        qs = qs.filter(inventory_item_id__in=item_ids)
    else:
        qs = qs.filter(inventory_item__is_active=True)
    if location_id is not None:
        qs = qs.filter(stock_location_id=location_id)
    rows = qs.values("inventory_item_id").annotate(
        r_in=Coalesce(Sum("quantity_in"), Value(QUANTITY_ZERO), output_field=DecimalField()),
        r_out=Coalesce(Sum("quantity_out"), Value(QUANTITY_ZERO), output_field=DecimalField()),
    )
    return {
        row["inventory_item_id"]: max(
            QUANTITY_ZERO,
            Decimal(str(row["r_in"] or 0)) - Decimal(str(row["r_out"] or 0)),
        )
        for row in rows
    }


def _parse_attribute_filters(
    attribute_key: str = "",
    attribute_value: str = "",
    attribute_filters: list[tuple[str, str]] | dict[str, str] | str | None = None,
) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    if attribute_key and attribute_value:
        pairs.append((attribute_key.strip(), attribute_value.strip()))
    if isinstance(attribute_filters, dict):
        for k, v in attribute_filters.items():
            if str(k).strip() and str(v).strip():
                pairs.append((str(k).strip(), str(v).strip()))
    elif isinstance(attribute_filters, list):
        for entry in attribute_filters:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                k, v = str(entry[0]).strip(), str(entry[1]).strip()
                if k and v:
                    pairs.append((k, v))
    elif isinstance(attribute_filters, str) and attribute_filters.strip():
        raw = attribute_filters.strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if str(k).strip() and str(v).strip():
                        pairs.append((str(k).strip(), str(v).strip()))
            elif isinstance(parsed, list):
                for entry in parsed:
                    if isinstance(entry, dict) and entry.get("key") and entry.get("value"):
                        pairs.append((str(entry["key"]).strip(), str(entry["value"]).strip()))
        except Exception:
            for chunk in raw.split("|"):
                if ":" in chunk:
                    k, v = chunk.split(":", 1)
                    if k.strip() and v.strip():
                        pairs.append((k.strip(), v.strip()))
    # Deduplicate preserving order
    seen: set[tuple[str, str]] = set()
    unique_pairs: list[tuple[str, str]] = []
    for k, v in pairs:
        sig = (k.lower(), v.lower())
        if sig not in seen:
            seen.add(sig)
            unique_pairs.append((k, v))
    return unique_pairs


def _item_matches_attributes(item: InventoryItem, attr_pairs: list[tuple[str, str]]) -> bool:
    if not attr_pairs:
        return True
    attrs = extract_inventory_item_attributes(item)
    lowered = {k.lower(): v.lower() for k, v in attrs.items()}
    for k, v in attr_pairs:
        kl, vl = k.lower(), v.lower()
        if lowered.get(kl) != vl:
            return False
    return True


def _base_inventory_queryset(
    *,
    search: str = "",
    item_type: str = "",
    category: str = "",
    subcategory: str = "",
    stock_status: str = "all",
    location_id: int | None = None,
):
    qs = _annotate_stock_qty(InventoryItem.objects.all(), location_id=location_id).select_related(
        "product",
        "product__category_master",
        "product__subcategory_master",
        "product__pim_variant",
        "product__pim_variant__product",
        "product__pim_variant__product__category",
        "product__pim_variant__product__subcategory",
        "default_stock_location",
        "variant_group",
    ).prefetch_related(
        "product__pim_variant__attribute_values__attribute",
        "product__pim__category",
        "product__pim__subcategory",
        "product__pim__attributes__attribute",
    ).annotate(
        _accessory_count=Count("accessory_links", distinct=True),
        _service_count=Count("service_links", distinct=True),
        _bom_count=Count("manufacturing_boms", distinct=True),
        _bom_usage_count=Count("manufacturing_bom_lines", distinct=True),
        _linked_fg_count=Count("linked_to_finished_goods", distinct=True),
    )

    if item_type and item_type != "ALL":
        type_upper = item_type.upper().strip()
        qs = qs.filter(Q(stock_item_type=type_upper) | Q(product__item_type=type_upper))

    if category and category != "ALL":
        clean_cat = category.strip()
        qs = qs.filter(
            Q(product__category__iexact=clean_cat)
            | Q(product__category_master__name__iexact=clean_cat)
            | Q(product__pim_variant__product__category__name__iexact=clean_cat)
            | Q(product__pim__category__name__iexact=clean_cat)
        ).distinct()

    if subcategory and subcategory != "ALL":
        clean_subcat = subcategory.strip()
        qs = qs.filter(
            Q(product__subcategory__iexact=clean_subcat)
            | Q(product__subcategory_master__name__iexact=clean_subcat)
            | Q(product__pim_variant__product__subcategory__name__iexact=clean_subcat)
            | Q(product__pim__subcategory__name__iexact=clean_subcat)
        ).distinct()

    if search:
        s = search.strip()
        qs = qs.filter(
            Q(sku__icontains=s)
            | Q(inventory_code__icontains=s)
            | Q(barcode__icontains=s)
            | Q(qr_code__icontains=s)
            | Q(variant_label__icontains=s)
            | Q(variant_group__name__icontains=s)
            | Q(product__product_code__icontains=s)
            | Q(product__name__icontains=s)
            | Q(product__brand__icontains=s)
            | Q(product__category__icontains=s)
            | Q(product__subcategory__icontains=s)
            | Q(product__pim_variant__variant_name__icontains=s)
            | Q(product__pim_variant__attribute_values__value_text__icontains=s)
            | Q(product__pim__attributes__value_text__icontains=s)
            | Q(product__base_specs__icontains=s)
        ).distinct()

    if stock_status == "in_stock":
        qs = qs.filter(physical_qty__gt=QUANTITY_ZERO)
    elif stock_status == "low_stock":
        qs = qs.filter(physical_qty__gt=QUANTITY_ZERO, physical_qty__lte=F("reorder_level_qty"), reorder_level_qty__gt=QUANTITY_ZERO)
    elif stock_status == "out_of_stock":
        qs = qs.filter(physical_qty__lte=QUANTITY_ZERO)
    elif stock_status == "attention":
        qs = qs.filter(Q(physical_qty__lte=QUANTITY_ZERO) | Q(physical_qty__lte=F("reorder_level_qty"), reorder_level_qty__gt=QUANTITY_ZERO))

    return qs


def _resolve_item_pricing(item: InventoryItem) -> tuple[Decimal, Decimal]:
    prod = getattr(item, "product", None)
    pim_var = getattr(prod, "pim_variant", None)
    cost = item.standard_unit_cost or getattr(pim_var, "cost_price", None) or item.purchase_unit_cost or MONEY_ZERO
    price = getattr(pim_var, "price", None) or getattr(prod, "base_price", MONEY_ZERO) or MONEY_ZERO
    return Decimal(str(cost)), Decimal(str(price))


def _serialize_stock_on_hand_row(
    item: InventoryItem,
    *,
    reserved_map: dict[int, Decimal],
    location_breakdown_map: dict[int, list[dict]],
) -> dict:
    prod = getattr(item, "product", None)
    pim_var = getattr(prod, "pim_variant", None)
    pim_prod = _resolve_pim_product(prod)

    physical = Decimal(str(getattr(item, "physical_qty", None) or 0))
    reserved = reserved_map.get(item.id, item.reserved_qty() if hasattr(item, "_reserved_stock_cache") else QUANTITY_ZERO)
    available = max(QUANTITY_ZERO, physical - reserved)
    reorder = Decimal(str(item.reorder_level_qty or 0))
    shortage = max(reorder - physical, QUANTITY_ZERO)

    cost, price = _resolve_item_pricing(item)
    val_total = (physical * cost).quantize(Decimal("0.01"))
    margin_pct = None
    if price > MONEY_ZERO and cost > MONEY_ZERO:
        margin_pct = (((price - cost) / price) * Decimal("100")).quantize(Decimal("0.01"))

    cat_name, subcat_name = _resolve_category_and_subcategory(item)
    attrs_map = extract_inventory_item_attributes(item)
    attrs_list = [{"name": k, "value": v} for k, v in attrs_map.items()]

    if physical <= QUANTITY_ZERO:
        status_tag = "OUT_OF_STOCK"
    elif reorder > QUANTITY_ZERO and physical <= reorder:
        status_tag = "LOW_STOCK"
    else:
        status_tag = "HEALTHY"

    item_type_val = item.stock_item_type or getattr(prod, "item_type", "FINISHED_GOOD")
    item_type_label = dict(item._meta.get_field("stock_item_type").choices).get(item_type_val, item_type_val)
    brand = (getattr(pim_var, "brand", "") or "").strip() or (getattr(prod, "brand", "") or "").strip() or (getattr(pim_prod, "brand", "") or "").strip()

    return {
        "inventory_item_id": item.id,
        "product_id": item.product_id,
        "pim_product_id": pim_prod.id if pim_prod else None,
        "pim_variant_id": pim_var.id if pim_var else None,
        "product_code": getattr(prod, "product_code", ""),
        "product_name": getattr(pim_var, "variant_name", "") or getattr(prod, "name", item.inventory_code or "Inventory Item"),
        "brand": brand,
        "sku": item.sku or getattr(prod, "sku", "") or "",
        "barcode": item.barcode or "",
        "qr_code": item.qr_code or "",
        "item_type": item_type_val,
        "item_type_display": item_type_label,
        "category": cat_name,
        "subcategory": subcat_name,
        "unit_of_measure": item.unit_of_measure or getattr(prod, "unit_of_measure", "PCS") or "PCS",
        "attributes": attrs_list,
        "attributes_map": attrs_map,
        "physical_qty": str(physical),
        "reserved_qty": str(reserved),
        "available_qty": str(available),
        "reorder_point": str(reorder),
        "shortage_qty": str(shortage),
        "standard_cost": str(cost),
        "selling_price": str(price),
        "margin_percent": str(margin_pct) if margin_pct is not None else None,
        "valuation_total": str(val_total),
        "valuation_method": item.valuation_method,
        "stock_status": status_tag,
        "stock_tracking_enabled": item.stock_tracking_enabled,
        "stock_tracking_status": InventoryItem.live_stock_tracking_status(item.stock_tracking_status, physical),
        "lot_tracking_enabled": item.lot_tracking_enabled,
        "default_location_name": item.default_stock_location.name if item.default_stock_location_id else None,
        "location_breakdown": location_breakdown_map.get(item.id, []),
        "variant_group_name": item.variant_group.name if item.variant_group_id else None,
        "variant_label": item.variant_label or "",
        "accessory_count": getattr(item, "_accessory_count", 0),
        "service_count": getattr(item, "_service_count", 0),
        "bom_count": getattr(item, "_bom_count", 0),
        "bom_usage_count": getattr(item, "_bom_usage_count", 0),
        "linked_fg_count": getattr(item, "_linked_fg_count", 0),
        "is_active": item.is_active,
    }


def _apply_sort(items: list[InventoryItem], sort_by: str, reserved_map: dict[int, Decimal]) -> list[InventoryItem]:
    if sort_by == "name":
        return sorted(items, key=lambda it: ((getattr(it.product, "name", "") or "").lower(), it.id))
    if sort_by == "category":
        return sorted(
            items,
            key=lambda it: (
                _resolve_category_and_subcategory(it)[0].lower(),
                _resolve_category_and_subcategory(it)[1].lower(),
                (getattr(it.product, "name", "") or "").lower(),
            ),
        )
    if sort_by == "physical_desc":
        return sorted(items, key=lambda it: Decimal(str(getattr(it, "physical_qty", 0) or 0)), reverse=True)
    if sort_by == "physical_asc":
        return sorted(items, key=lambda it: Decimal(str(getattr(it, "physical_qty", 0) or 0)))
    if sort_by == "available_desc":
        return sorted(
            items,
            key=lambda it: max(QUANTITY_ZERO, Decimal(str(getattr(it, "physical_qty", 0) or 0)) - reserved_map.get(it.id, QUANTITY_ZERO)),
            reverse=True,
        )
    if sort_by == "available_asc":
        return sorted(
            items,
            key=lambda it: max(QUANTITY_ZERO, Decimal(str(getattr(it, "physical_qty", 0) or 0)) - reserved_map.get(it.id, QUANTITY_ZERO)),
        )
    if sort_by == "value_desc":
        return sorted(
            items,
            key=lambda it: Decimal(str(getattr(it, "physical_qty", 0) or 0)) * _resolve_item_pricing(it)[0],
            reverse=True,
        )
    if sort_by == "shortage_desc":
        return sorted(
            items,
            key=lambda it: Decimal(str(it.reorder_level_qty or 0)) - Decimal(str(getattr(it, "physical_qty", 0) or 0)),
            reverse=True,
        )
    return items


def get_stock_on_hand_items(
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    item_type: str = "",
    category: str = "",
    subcategory: str = "",
    attribute_key: str = "",
    attribute_value: str = "",
    stock_status: str = "all",
    location_id: int | None = None,
    attribute_filters: list[tuple[str, str]] | dict[str, str] | str | None = None,
    sort_by: str = "code",
):
    """
    Return inventory profiles with ledger-backed physical and available balances,
    filtered by item type, category, subcategory, location, and multi-variant attributes.
    """
    qs = _base_inventory_queryset(
        search=search,
        item_type=item_type,
        category=category,
        subcategory=subcategory,
        stock_status=stock_status,
        location_id=location_id,
    ).order_by("product__product_code", "sku", "id")

    attr_pairs = _parse_attribute_filters(attribute_key, attribute_value, attribute_filters)
    all_candidates = list(qs)
    if attr_pairs:
        filtered_items = [it for it in all_candidates if _item_matches_attributes(it, attr_pairs)]
    else:
        filtered_items = all_candidates

    item_ids = [it.id for it in filtered_items]
    reserved_map = _build_reserved_map(item_ids=item_ids, location_id=location_id)

    if sort_by and sort_by != "code":
        filtered_items = _apply_sort(filtered_items, sort_by, reserved_map)

    # Filtered summary across ALL matching items (before pagination)
    f_physical = QUANTITY_ZERO
    f_reserved = QUANTITY_ZERO
    f_available = QUANTITY_ZERO
    f_value = MONEY_ZERO
    f_in_stock = 0
    f_low_stock = 0
    f_out_of_stock = 0

    for it in filtered_items:
        phys = Decimal(str(getattr(it, "physical_qty", 0) or 0))
        res = reserved_map.get(it.id, QUANTITY_ZERO)
        avail = max(QUANTITY_ZERO, phys - res)
        reorder = Decimal(str(it.reorder_level_qty or 0))
        cost, _ = _resolve_item_pricing(it)

        f_physical += phys
        f_reserved += res
        f_available += avail
        if phys > QUANTITY_ZERO:
            f_value += (phys * cost).quantize(Decimal("0.01"))

        if phys <= QUANTITY_ZERO:
            f_out_of_stock += 1
        elif reorder > QUANTITY_ZERO and phys <= reorder:
            f_low_stock += 1
        else:
            f_in_stock += 1

    total_count = len(filtered_items)
    num_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 0
    page = max(1, min(page, num_pages)) if num_pages else 1
    page_rows = filtered_items[(page - 1) * page_size : page * page_size]

    if location_id is None:
        attach_bulk_stock_quantities(page_rows)

    loc_breakdown_map = _build_location_breakdown_map([it.id for it in page_rows])

    results = [
        _serialize_stock_on_hand_row(
            item,
            reserved_map=reserved_map,
            location_breakdown_map=loc_breakdown_map,
        )
        for item in page_rows
    ]

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "filtered_summary": {
            "total_skus": total_count,
            "in_stock_count": f_in_stock,
            "low_stock_count": f_low_stock,
            "out_of_stock_count": f_out_of_stock,
            "total_physical_qty": str(f_physical),
            "total_reserved_qty": str(f_reserved),
            "total_available_qty": str(f_available),
            "total_value": str(f_value),
        },
        "results": results,
    }


def export_stock_on_hand_csv(
    *,
    search: str = "",
    item_type: str = "",
    category: str = "",
    subcategory: str = "",
    attribute_key: str = "",
    attribute_value: str = "",
    stock_status: str = "all",
    location_id: int | None = None,
    attribute_filters: list[tuple[str, str]] | dict[str, str] | str | None = None,
    sort_by: str = "category",
) -> list[dict]:
    """Return flat dict rows for CSV export across all matching stock items."""
    payload = get_stock_on_hand_items(
        page=1,
        page_size=10000,
        search=search,
        item_type=item_type,
        category=category,
        subcategory=subcategory,
        attribute_key=attribute_key,
        attribute_value=attribute_value,
        stock_status=stock_status,
        location_id=location_id,
        attribute_filters=attribute_filters,
        sort_by=sort_by,
    )
    csv_rows: list[dict] = []
    for row in payload["results"]:
        specs = "; ".join(f"{a['name']}: {a['value']}" for a in row.get("attributes") or [])
        locs = "; ".join(
            f"{l['location_name']}: {float(l['on_hand_qty']):.2f}"
            for l in row.get("location_breakdown") or []
        )
        csv_rows.append({
            "SKU": row["sku"],
            "Product Code": row["product_code"],
            "Product Name": row["product_name"],
            "Brand": row.get("brand") or "",
            "Item Type": row["item_type_display"],
            "Category": row["category"],
            "Subcategory": row["subcategory"],
            "Attributes / Specifications": specs,
            "UoM": row["unit_of_measure"],
            "Physical SOH": row["physical_qty"],
            "Reserved": row["reserved_qty"],
            "Available ATP": row["available_qty"],
            "Reorder Level": row["reorder_point"],
            "Stock Status": row["stock_status"],
            "Locations": locs or (row.get("default_location_name") or ""),
            "Standard Cost": row["standard_cost"],
            "Selling Price": row["selling_price"],
            "Stock Valuation": row["valuation_total"],
        })
    return csv_rows


def get_stock_on_hand_facets(
    *,
    item_type: str = "",
    category: str = "",
    subcategory: str = "",
    location_id: int | None = None,
) -> dict:
    """
    Returns aggregation facets for item types, category -> subcategory tree with stock totals,
    scoped dynamic variant/product attribute counts, and active stock locations.
    """
    all_items = list(
        _annotate_stock_qty(InventoryItem.objects.filter(is_active=True), location_id=location_id)
        .select_related(
            "product",
            "product__category_master",
            "product__subcategory_master",
            "product__pim_variant",
            "product__pim_variant__product",
            "product__pim_variant__product__category",
            "product__pim_variant__product__subcategory",
            "variant_group",
        )
        .prefetch_related(
            "product__pim_variant__attribute_values__attribute",
            "product__pim__category",
            "product__pim__subcategory",
            "product__pim__attributes__attribute",
        )
    )
    reserved_map = _build_reserved_map(item_ids=[it.id for it in all_items], location_id=location_id)

    # 1. Item Types summary across all active items
    type_buckets: dict[str, dict] = {
        "ALL": {"code": "ALL", "label": "All Inventory", "count": 0, "physical_qty": QUANTITY_ZERO, "available_qty": QUANTITY_ZERO, "valuation_total": MONEY_ZERO},
        "FINISHED_GOOD": {"code": "FINISHED_GOOD", "label": "Finished Goods", "count": 0, "physical_qty": QUANTITY_ZERO, "available_qty": QUANTITY_ZERO, "valuation_total": MONEY_ZERO},
        "RAW_MATERIAL": {"code": "RAW_MATERIAL", "label": "Raw Materials", "count": 0, "physical_qty": QUANTITY_ZERO, "available_qty": QUANTITY_ZERO, "valuation_total": MONEY_ZERO},
        "ACCESSORY": {"code": "ACCESSORY", "label": "Accessories & Hardware", "count": 0, "physical_qty": QUANTITY_ZERO, "available_qty": QUANTITY_ZERO, "valuation_total": MONEY_ZERO},
    }

    type_upper = item_type.upper().strip() if item_type and item_type != "ALL" else ""
    cat_filter_lower = category.strip().lower() if category and category != "ALL" else ""
    subcat_filter_lower = subcategory.strip().lower() if subcategory and subcategory != "ALL" else ""

    # Category tree scoped by item_type
    cat_tree_map: dict[str, dict] = {}
    # Attribute facets scoped by item_type + category + subcategory
    attr_facet_map: dict[str, dict[str, dict]] = {}
    flat_categories_count: dict[str, int] = {}
    subcategories_set: set[str] = set()

    for item in all_items:
        prod = getattr(item, "product", None)
        it_type = item.stock_item_type or getattr(prod, "item_type", "FINISHED_GOOD")
        phys = Decimal(str(getattr(item, "physical_qty", 0) or 0))
        res = reserved_map.get(item.id, QUANTITY_ZERO)
        avail = max(QUANTITY_ZERO, phys - res)
        reorder = Decimal(str(item.reorder_level_qty or 0))
        cost, _ = _resolve_item_pricing(item)
        val_total = (phys * cost).quantize(Decimal("0.01")) if phys > QUANTITY_ZERO else MONEY_ZERO

        for key in ("ALL", it_type):
            if key in type_buckets:
                b = type_buckets[key]
                b["count"] += 1
                b["physical_qty"] += phys
                b["available_qty"] += avail
                b["valuation_total"] += val_total

        cat_name, subcat_name = _resolve_category_and_subcategory(item)
        flat_categories_count[cat_name] = flat_categories_count.get(cat_name, 0) + 1
        if subcat_name and (not cat_filter_lower or cat_name.lower() == cat_filter_lower):
            subcategories_set.add(subcat_name)

        # Match item_type for category tree
        prod_type = (getattr(prod, "item_type", "") or "").upper()
        if type_upper and it_type != type_upper and prod_type != type_upper:
            continue

        cat_entry = cat_tree_map.setdefault(
            cat_name,
            {
                "name": cat_name,
                "sku_count": 0,
                "in_stock_count": 0,
                "low_stock_count": 0,
                "out_of_stock_count": 0,
                "physical_qty": QUANTITY_ZERO,
                "reserved_qty": QUANTITY_ZERO,
                "available_qty": QUANTITY_ZERO,
                "valuation_total": MONEY_ZERO,
                "subcategories": {},
            },
        )
        cat_entry["sku_count"] += 1
        cat_entry["physical_qty"] += phys
        cat_entry["reserved_qty"] += res
        cat_entry["available_qty"] += avail
        cat_entry["valuation_total"] += val_total
        if phys <= QUANTITY_ZERO:
            cat_entry["out_of_stock_count"] += 1
        elif reorder > QUANTITY_ZERO and phys <= reorder:
            cat_entry["low_stock_count"] += 1
        else:
            cat_entry["in_stock_count"] += 1

        if subcat_name:
            sub_entry = cat_entry["subcategories"].setdefault(
                subcat_name,
                {
                    "name": subcat_name,
                    "sku_count": 0,
                    "in_stock_count": 0,
                    "low_stock_count": 0,
                    "out_of_stock_count": 0,
                    "physical_qty": QUANTITY_ZERO,
                    "reserved_qty": QUANTITY_ZERO,
                    "available_qty": QUANTITY_ZERO,
                    "valuation_total": MONEY_ZERO,
                },
            )
            sub_entry["sku_count"] += 1
            sub_entry["physical_qty"] += phys
            sub_entry["reserved_qty"] += res
            sub_entry["available_qty"] += avail
            sub_entry["valuation_total"] += val_total
            if phys <= QUANTITY_ZERO:
                sub_entry["out_of_stock_count"] += 1
            elif reorder > QUANTITY_ZERO and phys <= reorder:
                sub_entry["low_stock_count"] += 1
            else:
                sub_entry["in_stock_count"] += 1

        # Match category/subcategory for attribute facets
        if cat_filter_lower and cat_name.lower() != cat_filter_lower:
            continue
        if subcat_filter_lower and subcat_name.lower() != subcat_filter_lower:
            continue

        item_attrs = extract_inventory_item_attributes(item)
        for attr_name, attr_val in item_attrs.items():
            val_bucket = attr_facet_map.setdefault(attr_name, {}).setdefault(
                attr_val,
                {
                    "value": attr_val,
                    "sku_count": 0,
                    "physical_qty": QUANTITY_ZERO,
                    "available_qty": QUANTITY_ZERO,
                },
            )
            val_bucket["sku_count"] += 1
            val_bucket["physical_qty"] += phys
            val_bucket["available_qty"] += avail

    item_types = [
        {
            "code": b["code"],
            "label": b["label"],
            "count": b["count"],
            "physical_qty": str(b["physical_qty"]),
            "available_qty": str(b["available_qty"]),
            "valuation_total": str(b["valuation_total"]),
        }
        for b in type_buckets.values()
    ]

    categories = [
        {"name": cat, "count": cnt}
        for cat, cnt in sorted(flat_categories_count.items(), key=lambda x: (-x[1], x[0]))
    ]

    category_tree = []
    for cat_entry in sorted(cat_tree_map.values(), key=lambda c: (-c["sku_count"], c["name"])):
        subs = [
            {
                "name": s["name"],
                "sku_count": s["sku_count"],
                "in_stock_count": s["in_stock_count"],
                "low_stock_count": s["low_stock_count"],
                "out_of_stock_count": s["out_of_stock_count"],
                "physical_qty": str(s["physical_qty"]),
                "reserved_qty": str(s["reserved_qty"]),
                "available_qty": str(s["available_qty"]),
                "valuation_total": str(s["valuation_total"]),
            }
            for s in sorted(cat_entry["subcategories"].values(), key=lambda x: (-x["sku_count"], x["name"]))
        ]
        category_tree.append({
            "name": cat_entry["name"],
            "sku_count": cat_entry["sku_count"],
            "in_stock_count": cat_entry["in_stock_count"],
            "low_stock_count": cat_entry["low_stock_count"],
            "out_of_stock_count": cat_entry["out_of_stock_count"],
            "physical_qty": str(cat_entry["physical_qty"]),
            "reserved_qty": str(cat_entry["reserved_qty"]),
            "available_qty": str(cat_entry["available_qty"]),
            "valuation_total": str(cat_entry["valuation_total"]),
            "subcategories": subs,
        })

    attribute_facets = []
    attributes_simple: dict[str, list[str]] = {}
    for attr_name, val_map in sorted(attr_facet_map.items(), key=lambda kv: (-sum(v["sku_count"] for v in kv[1].values()), kv[0])):
        sorted_vals = sorted(val_map.values(), key=lambda v: (-float(v["available_qty"]), -v["sku_count"], v["value"]))
        attributes_simple[attr_name] = [v["value"] for v in sorted_vals]
        attribute_facets.append({
            "name": attr_name,
            "values": [
                {
                    "value": v["value"],
                    "sku_count": v["sku_count"],
                    "physical_qty": str(v["physical_qty"]),
                    "available_qty": str(v["available_qty"]),
                }
                for v in sorted_vals
            ],
        })

    locations = [
        {
            "id": loc.id,
            "code": loc.code,
            "name": loc.name,
            "location_type": loc.location_type,
        }
        for loc in StockLocation.objects.filter(is_active=True).order_by("name", "id")
    ]

    return {
        "item_types": item_types,
        "categories": categories,
        "subcategories": sorted(list(subcategories_set)),
        "category_tree": category_tree,
        "attributes": attributes_simple,
        "attribute_facets": attribute_facets,
        "locations": locations,
    }


def get_stock_item_calculation_details(inventory_item_id: int) -> dict:
    """
    Returns comprehensive stock math calculations, location breakdown, linked catalog metadata,
    and the last 15 ledger movements for a specific inventory item.
    """
    item = (
        InventoryItem.objects.filter(pk=inventory_item_id)
        .select_related(
            "product",
            "product__category_master",
            "product__subcategory_master",
            "product__pim_variant",
            "product__pim_variant__product",
            "default_stock_location",
            "variant_group",
        )
        .prefetch_related(
            "product__pim_variant__attribute_values__attribute",
            "product__pim__attributes__attribute",
            "product__pim__category",
            "product__pim__subcategory",
        )
        .first()
    )
    if not item:
        raise ValueError("Inventory item not found.")

    annotated = _annotate_stock_qty(InventoryItem.objects.filter(pk=inventory_item_id)).first()
    physical_qty = annotated.physical_qty if annotated else Decimal("0.00")
    reserved_qty = item.reserved_qty()
    available_qty = max(Decimal("0.00"), physical_qty - reserved_qty)
    reorder_level = item.reorder_level_qty or Decimal("0.00")

    # Inflows & Outflows breakdowns from StockLedger
    ledger_entries = item.stock_ledger.select_related("stock_location").order_by("-created_at", "-id")

    purchases_in = Decimal("0.000")
    production_in = Decimal("0.000")
    returns_in = Decimal("0.000")
    adjustments_in = Decimal("0.000")

    sales_out = Decimal("0.000")
    deliveries_out = Decimal("0.000")
    production_out = Decimal("0.000")
    adjustments_out = Decimal("0.000")

    for entry in ledger_entries.all():
        m_type = entry.movement_type
        qin = entry.quantity_in or Decimal("0.000")
        qout = entry.quantity_out or Decimal("0.000")

        if m_type in (StockMovementType.PURCHASE_IN, StockMovementType.PURCHASE_RECEIVE):
            purchases_in += qin
        elif m_type in (StockMovementType.PRODUCTION_OUTPUT, StockMovementType.PRODUCTION_RECEIPT_IN):
            production_in += qin
        elif m_type in (StockMovementType.CUSTOMER_RETURN, StockMovementType.SALE_RETURN_IN, StockMovementType.EMI_RETURN_IN, StockMovementType.RENT_RETURN_IN, StockMovementType.LEASE_RETURN_IN):
            returns_in += qin
        elif m_type in (StockMovementType.ADJUSTMENT_IN, StockMovementType.OPENING_BALANCE_IN):
            adjustments_in += qin

        if m_type in (StockMovementType.SALE_OUT,):
            sales_out += qout
        elif m_type in (StockMovementType.EMI_DELIVERY_OUT, StockMovementType.RENT_HANDOVER_OUT, StockMovementType.LEASE_HANDOVER_OUT):
            deliveries_out += qout
        elif m_type in (StockMovementType.PRODUCTION_ISSUE_OUT,):
            production_out += qout
        elif m_type in (StockMovementType.ADJUSTMENT_OUT, StockMovementType.DAMAGE, StockMovementType.PURCHASE_RETURN_OUT):
            adjustments_out += qout

    total_inflows = purchases_in + production_in + returns_in + adjustments_in
    total_outflows = sales_out + deliveries_out + production_out + adjustments_out

    # Last 15 movements formatted
    recent_movements = []
    for entry in ledger_entries[:15]:
        m_display = dict(StockMovementType.choices).get(entry.movement_type, entry.movement_type)
        recent_movements.append({
            "id": entry.id,
            "created_at": entry.created_at.strftime("%d %b %Y, %I:%M %p"),
            "movement_type": entry.movement_type,
            "movement_type_display": m_display,
            "quantity_in": str(entry.quantity_in or Decimal("0.00")),
            "quantity_out": str(entry.quantity_out or Decimal("0.00")),
            "running_balance": str(getattr(entry, "running_balance", None)) if getattr(entry, "running_balance", None) is not None else "—",
            "location_name": entry.stock_location.name if entry.stock_location_id else (entry.warehouse_name or ""),
            "reference_model": entry.reference_model or "",
            "reference_id": entry.reference_id or "",
            "notes": entry.notes or "",
        })

    prod = getattr(item, "product", None)
    pim_var = getattr(prod, "pim_variant", None)
    pim_prod = _resolve_pim_product(prod)
    cost, price = _resolve_item_pricing(item)
    cat_name, subcat_name = _resolve_category_and_subcategory(item)
    item_type_val = item.stock_item_type or getattr(prod, "item_type", "FINISHED_GOOD")
    item_type_label = dict(item._meta.get_field("stock_item_type").choices).get(item_type_val, item_type_val)
    brand = (getattr(pim_var, "brand", "") or "").strip() or (getattr(prod, "brand", "") or "").strip() or (getattr(pim_prod, "brand", "") or "").strip()

    location_breakdown = _build_location_breakdown_map([item.id]).get(item.id, [])

    return {
        "inventory_item_id": item.id,
        "product_id": item.product_id,
        "pim_product_id": pim_prod.id if pim_prod else None,
        "pim_variant_id": pim_var.id if pim_var else None,
        "sku": item.sku or "",
        "product_name": getattr(pim_var, "variant_name", "") or getattr(prod, "name", item.inventory_code or "Inventory Item"),
        "product_code": getattr(prod, "product_code", ""),
        "brand": brand,
        "barcode": item.barcode or "",
        "qr_code": item.qr_code or "",
        "item_type": item_type_val,
        "item_type_display": item_type_label,
        "category": cat_name,
        "subcategory": subcat_name,
        "unit_of_measure": item.unit_of_measure or "PCS",
        "valuation_method": item.valuation_method,
        "standard_cost": str(cost),
        "selling_price": str(price),
        "valuation_total": str((physical_qty * cost).quantize(Decimal("0.01"))),
        "default_location_name": item.default_stock_location.name if item.default_stock_location_id else None,
        "location_breakdown": location_breakdown,
        "linked_accessories_count": item.accessory_links.count(),
        "linked_services_count": item.service_links.count(),
        "bom_count": item.manufacturing_boms.count(),
        "bom_usage_count": item.manufacturing_bom_lines.count(),
        "linked_fg_count": item.linked_to_finished_goods.count(),
        "attributes": extract_inventory_item_attributes(item),
        "calculation": {
            "opening_stock_qty": str(item.opening_stock_qty or Decimal("0.00")),
            "total_inflows": str(total_inflows),
            "total_outflows": str(total_outflows),
            "physical_qty": str(physical_qty),
            "reserved_qty": str(reserved_qty),
            "available_qty": str(available_qty),
            "reorder_level_qty": str(reorder_level),
            "inflows_breakdown": {
                "purchases": str(purchases_in),
                "production": str(production_in),
                "returns": str(returns_in),
                "adjustments_in": str(adjustments_in),
            },
            "outflows_breakdown": {
                "direct_sales": str(sales_out),
                "deliveries": str(deliveries_out),
                "production_consumption": str(production_out),
                "adjustments_out": str(adjustments_out),
            },
        },
        "recent_movements": recent_movements,
    }
