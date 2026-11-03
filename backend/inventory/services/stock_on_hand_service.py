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

from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce

from inventory.models import InventoryItem, SOFT_HOLD_MOVEMENT_TYPES, StockLedger, StockMovementType
from inventory.services.stock_service import attach_bulk_stock_quantities

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")
_SOFT_HOLDS = list(SOFT_HOLD_MOVEMENT_TYPES)

def _annotate_stock_qty(qs):
    return qs.annotate(
        _ledger_in=Coalesce(
            Sum("stock_ledger__quantity_in", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO), output_field=DecimalField(),
        ),
        _ledger_out=Coalesce(
            Sum("stock_ledger__quantity_out", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO), output_field=DecimalField(),
        ),
    ).annotate(
        physical_qty=ExpressionWrapper(
            Coalesce(F("opening_stock_qty"), Value(QUANTITY_ZERO), output_field=DecimalField()) + F("_ledger_in") - F("_ledger_out"),
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


def extract_inventory_item_attributes(item: InventoryItem) -> dict[str, str]:
    """
    Returns a normalized key-value dict of variant attributes for an inventory item,
    e.g. {"Size": "King", "Material": "Solid Wood", "Finish": "Teak Brown"}.
    Checks linked PIM variant attribute values, product base_specs, and accessory groups.
    """
    attrs: dict[str, str] = {}
    prod = getattr(item, "product", None)
    if not prod:
        return attrs

    # 1. PIM Variant Attributes
    pim_var = getattr(prod, "pim_variant", None)
    if pim_var:
        try:
            for val in pim_var.attribute_values.select_related("attribute").all():
                attr_name = (val.attribute.name or "").strip()
                text_val = (val.value_text or "").strip()
                if not text_val and val.value_number is not None:
                    text_val = str(val.value_number)
                elif not text_val and val.value_boolean is not None:
                    text_val = "Yes" if val.value_boolean else "No"
                if attr_name and text_val:
                    attrs[attr_name] = text_val
        except Exception:
            pass

    # 2. Product base_specs (as fallback or addition)
    if isinstance(prod.base_specs, dict):
        for k, v in prod.base_specs.items():
            clean_k = str(k).replace("_", " ").title().strip()
            if clean_k not in attrs and v is not None and str(v).strip():
                attrs[clean_k] = str(v).strip()

    # 3. Variant group (for accessories)
    vg = getattr(item, "variant_group", None) or getattr(item, "accessory_variant_group", None)
    if vg:
        attrs["Variant Group"] = getattr(vg, "name", str(vg))

    return attrs


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
):
    """
    Return inventory profiles with ledger-backed physical and available balances,
    filtered by item type, category, subcategory, and variant attributes.
    """
    qs = _annotate_stock_qty(InventoryItem.objects.all()).select_related(
        "product",
        "product__category_master",
        "product__subcategory_master",
        "product__pim_variant",
    ).prefetch_related(
        "product__pim_variant__attribute_values__attribute",
    )

    # 1. Item Type Filter (Finished Goods, Raw Materials, Accessories)
    if item_type and item_type != "ALL":
        type_upper = item_type.upper().strip()
        qs = qs.filter(Q(stock_item_type=type_upper) | Q(product__item_type=type_upper))

    # 2. Category Filter
    if category and category != "ALL":
        clean_cat = category.strip()
        qs = qs.filter(
            Q(product__category__iexact=clean_cat)
            | Q(product__category_master__name__iexact=clean_cat)
        )

    # 3. Subcategory Filter
    if subcategory and subcategory != "ALL":
        clean_subcat = subcategory.strip()
        qs = qs.filter(
            Q(product__subcategory__iexact=clean_subcat)
            | Q(product__subcategory_master__name__iexact=clean_subcat)
        )

    # 4. Search Filter
    if search:
        s = search.strip()
        qs = qs.filter(
            Q(sku__icontains=s)
            | Q(inventory_code__icontains=s)
            | Q(barcode__icontains=s)
            | Q(qr_code__icontains=s)
            | Q(product__product_code__icontains=s)
            | Q(product__name__icontains=s)
            | Q(product__category__icontains=s)
            | Q(product__subcategory__icontains=s)
            | Q(product__pim_variant__variant_name__icontains=s)
            | Q(product__pim_variant__attribute_values__value_text__icontains=s)
        ).distinct()

    # 5. Attribute Filter (e.g. Size=King, Material=Solid Wood)
    if attribute_key and attribute_value:
        attr_k = attribute_key.strip()
        attr_v = attribute_value.strip()
        qs = qs.filter(
            Q(
                product__pim_variant__attribute_values__attribute__name__iexact=attr_k,
                product__pim_variant__attribute_values__value_text__iexact=attr_v,
            )
            | Q(product__base_specs__icontains=attr_v)
        ).distinct()

    # 6. Stock Status Filter
    if stock_status == "in_stock":
        qs = qs.filter(physical_qty__gt=Decimal("0"))
    elif stock_status == "low_stock":
        qs = qs.filter(physical_qty__lte=F("reorder_level_qty"), reorder_level_qty__gt=Decimal("0"))
    elif stock_status == "out_of_stock":
        qs = qs.filter(physical_qty__lte=Decimal("0"))

    qs = qs.order_by("product__product_code", "sku", "id")
    total_count = qs.count()
    num_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 0
    page = max(1, min(page, num_pages)) if num_pages else 1
    rows = list(qs[(page - 1) * page_size : page * page_size])
    attach_bulk_stock_quantities(rows)

    results = []
    for item in rows:
        prod = getattr(item, "product", None)
        physical = item.physical_qty or Decimal("0")
        reserved = item.reserved_qty()
        available = item.available_qty()
        reorder = item.reorder_level_qty or Decimal("0")
        shortage = max(reorder - physical, Decimal("0"))

        pim_var = getattr(prod, "pim_variant", None)
        cost = item.standard_unit_cost or getattr(pim_var, "cost_price", None) or item.purchase_unit_cost or Decimal("0.00")
        price = getattr(pim_var, "price", None) or getattr(prod, "base_price", Decimal("0.00")) or Decimal("0.00")
        val_total = (physical * cost).quantize(Decimal("0.01"))

        # Category and Subcategory resolution
        cat_name = getattr(prod, "category", "") or getattr(getattr(prod, "category_master", None), "name", "") or "Uncategorized"
        subcat_name = getattr(prod, "subcategory", "") or getattr(getattr(prod, "subcategory_master", None), "name", "") or ""

        # Extract attributes
        attrs_map = extract_inventory_item_attributes(item)
        attrs_list = [{"name": k, "value": v} for k, v in attrs_map.items()]

        # Stock Status Tag
        if physical <= Decimal("0"):
            status_tag = "OUT_OF_STOCK"
        elif reorder > Decimal("0") and physical <= reorder:
            status_tag = "LOW_STOCK"
        else:
            status_tag = "HEALTHY"

        item_type_val = item.stock_item_type or getattr(prod, "item_type", "FINISHED_GOOD")
        item_type_label = dict(item._meta.get_field("stock_item_type").choices).get(item_type_val, item_type_val)

        results.append({
            "inventory_item_id": item.id,
            "product_id": item.product_id,
            "product_code": getattr(prod, "product_code", ""),
            "product_name": getattr(pim_var, "variant_name", "") or getattr(prod, "name", item.inventory_code or "Inventory Item"),
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
            "valuation_total": str(val_total),
            "stock_status": status_tag,
            "stock_tracking_enabled": item.stock_tracking_enabled,
            "stock_tracking_status": item.stock_tracking_status,
            "is_active": item.is_active,
        })

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "results": results,
    }


def get_stock_on_hand_facets() -> dict:
    """
    Returns aggregation facets for categories, subcategories, item types,
    and distinct variant attributes for the stock-on-hand command center.
    """
    from products_core.models import ProductCategoryMaster, ProductSubcategoryMaster
    from products_pim.models import CategoryAttribute, VariantAttributeValue

    # 1. Item Types with Counts
    item_types_raw = (
        InventoryItem.objects.filter(is_active=True)
        .values("stock_item_type")
        .annotate(total=Sum(Value(1)))
        .order_by("-total")
    )
    item_types = [
        {
            "code": row["stock_item_type"],
            "label": row["stock_item_type"].replace("_", " ").title(),
            "count": row["total"],
        }
        for row in item_types_raw
    ]

    # 2. Categories with Counts
    categories_dict: dict[str, int] = {}
    for item in InventoryItem.objects.select_related("product", "product__category_master").all():
        prod = getattr(item, "product", None)
        cat = getattr(prod, "category", "") or getattr(getattr(prod, "category_master", None), "name", "") or "Uncategorized"
        categories_dict[cat] = categories_dict.get(cat, 0) + 1

    categories = [
        {"name": cat, "count": cnt}
        for cat, cnt in sorted(categories_dict.items(), key=lambda x: -x[1])
    ]

    # 3. Subcategories
    subcategories_set = set()
    for item in InventoryItem.objects.select_related("product").all():
        prod = getattr(item, "product", None)
        sub = getattr(prod, "subcategory", "") or getattr(getattr(prod, "subcategory_master", None), "name", "")
        if sub:
            subcategories_set.add(sub)
    subcategories = sorted(list(subcategories_set))

    # 4. Variant Attributes (e.g. Size: [King, Queen], Material: [Wood, Steel, Ply])
    attributes_facets: dict[str, list[str]] = {}
    try:
        vals = (
            VariantAttributeValue.objects.select_related("attribute")
            .exclude(value_text="")
            .values("attribute__name", "value_text")
            .distinct()
        )
        for row in vals:
            attr_name = row["attribute__name"].strip()
            val_txt = row["value_text"].strip()
            if attr_name not in attributes_facets:
                attributes_facets[attr_name] = []
            if val_txt not in attributes_facets[attr_name]:
                attributes_facets[attr_name].append(val_txt)
    except Exception:
        pass

    # Include common furniture defaults if empty so filter pills remain available
    if not attributes_facets.get("Size"):
        attributes_facets["Size"] = ["King", "Queen", "Single", "Double"]
    if not attributes_facets.get("Material"):
        attributes_facets["Material"] = ["Solid Wood", "Steel", "Plywood", "Engineered Wood"]
    if not attributes_facets.get("Storage"):
        attributes_facets["Storage"] = ["Hydraulic", "Box", "None"]

    return {
        "item_types": item_types,
        "categories": categories,
        "subcategories": subcategories,
        "attributes": attributes_facets,
    }


def get_stock_item_calculation_details(inventory_item_id: int) -> dict:
    """
    Returns comprehensive stock math calculations and the last 15 ledger movements
    for a specific inventory item to provide complete mathematical auditability.
    """
    item = (
        InventoryItem.objects.filter(pk=inventory_item_id)
        .select_related("product", "product__category_master", "product__subcategory_master")
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
    ledger_entries = item.stock_ledger.order_by("-created_at", "-id")

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
            "reference_model": entry.reference_model or "",
            "reference_id": entry.reference_id or "",
            "notes": entry.notes or "",
        })

    prod = getattr(item, "product", None)
    pim_var = getattr(prod, "pim_variant", None)
    cost = item.standard_unit_cost or getattr(pim_var, "cost_price", None) or item.purchase_unit_cost or Decimal("0.00")
    price = getattr(pim_var, "price", None) or getattr(prod, "base_price", Decimal("0.00")) or Decimal("0.00")

    return {
        "inventory_item_id": item.id,
        "sku": item.sku or "",
        "product_name": getattr(pim_var, "variant_name", "") or getattr(prod, "name", item.inventory_code or "Inventory Item"),
        "product_code": getattr(prod, "product_code", ""),
        "category": getattr(prod, "category", "") or getattr(getattr(prod, "category_master", None), "name", ""),
        "unit_of_measure": item.unit_of_measure or "PCS",
        "standard_cost": str(cost),
        "selling_price": str(price),
        "valuation_total": str((physical_qty * cost).quantize(Decimal("0.01"))),
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
