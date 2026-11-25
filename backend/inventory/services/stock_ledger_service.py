"""
Stock Ledger Enterprise Service

StockLedger model fields (after restructure):
  movement_type      (not transaction_type)
  quantity_in        (inbound qty)
  quantity_out       (outbound qty)
  movement_date      (date of movement)
  inventory_item     FK → InventoryItem → product (Product)
  stock_location     FK → StockLocation
  reference_model    (not reference_type)
  reference_id
  warehouse_name     (denormalised string)
"""

from decimal import Decimal

from django.db.models import DecimalField, Q, Sum
from django.db.models.functions import Coalesce

from inventory.models import StockLedger
from inventory.services.valuation_service import compute_product_costing_summary

# Movement types that count as inbound / outbound for KPI summary
_INBOUND_TYPES = {
    "OPENING_BALANCE_IN", "PURCHASE_IN", "PURCHASE_RECEIVE",
    "EMI_RETURN_IN", "CUSTOMER_RETURN", "SALE_RETURN_IN",
    "RENT_RETURN_IN", "LEASE_RETURN_IN",
    "PRODUCTION_RETURN_IN", "PRODUCTION_RECEIPT_IN", "PRODUCTION_OUTPUT",
    "ADJUSTMENT_IN", "TRANSFER_IN", "MAINTENANCE_RELEASE",
    "QUALITY_RELEASE",
}
_OUTBOUND_TYPES = {
    "SALE_OUT", "EMI_DELIVERY_OUT", "DELIVERY_OUT",
    "RENT_HANDOVER_OUT", "LEASE_HANDOVER_OUT",
    "PRODUCTION_ISSUE_OUT", "PRODUCTION_CONSUME",
    "PURCHASE_RETURN_OUT", "VENDOR_RETURN", "ADJUSTMENT_OUT",
    "TRANSFER_OUT", "DAMAGE", "MAINTENANCE_HOLD", "QUALITY_HOLD",
}


def _base_qs():
    return StockLedger.objects.select_related(
        "inventory_item",
        "inventory_item__product",
        "stock_location",
    ).prefetch_related(
        "inventory_item__product__pim_variant__attribute_values__attribute"
    )


def build_stock_ledger_list(
    search_query: str = "",
    movement_type_filter: str = "",
    reference_model_filter: str = "",
    date_from: str = "",
    date_to: str = "",
    inventory_item_id: str = "",
    page: int = 1,
    page_size: int = 50,
):
    qs = _base_qs()

    if inventory_item_id:
        qs = qs.filter(inventory_item_id=inventory_item_id)

    if search_query:
        qs = qs.filter(
            Q(inventory_item__product__name__icontains=search_query)
            | Q(inventory_item__product__product_code__icontains=search_query)
            | Q(inventory_item__sku__icontains=search_query)
            | Q(inventory_item__barcode__icontains=search_query)
            | Q(inventory_item__product__pim_variant__sku__icontains=search_query)
            | Q(warehouse_name__icontains=search_query)
            | Q(reference_model__icontains=search_query)
        )

    if movement_type_filter:
        qs = qs.filter(movement_type=movement_type_filter.upper())

    if reference_model_filter:
        qs = qs.filter(reference_model__iexact=reference_model_filter)

    if date_from:
        qs = qs.filter(movement_date__gte=date_from)

    if date_to:
        qs = qs.filter(movement_date__lte=date_to)

    # KPI aggregation (before pagination)
    total_inbound = qs.filter(movement_type__in=_INBOUND_TYPES).aggregate(
        t=Coalesce(Sum("quantity_in"), Decimal("0"), output_field=DecimalField())
    )["t"]
    total_outbound = qs.filter(movement_type__in=_OUTBOUND_TYPES).aggregate(
        t=Coalesce(Sum("quantity_out"), Decimal("0"), output_field=DecimalField())
    )["t"]
    net_change = total_inbound - total_outbound

    # Pagination
    total_count = qs.count()
    num_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 0
    page = max(1, min(page, num_pages)) if num_pages else 1
    start = (page - 1) * page_size
    page_qs = qs.order_by("-movement_date", "-id")[start : start + page_size]

    results = []
    costing_cache = {}
    for row in page_qs:
        item = row.inventory_item
        product = item.product if item else None

        if item and item.id not in costing_cache:
            costing_cache[item.id] = compute_product_costing_summary(inventory_item=item)
        elif not item and None not in costing_cache:
            costing_cache[None] = compute_product_costing_summary()
        costing = costing_cache.get(item.id if item else None) or {}
        
        product_name = ""
        if product:
            product_name = product.name
            if hasattr(product, "pim_variant") and product.pim_variant:
                attrs = []
                for attr_val in product.pim_variant.attribute_values.all():
                    if attr_val.attribute.data_type == "BOOLEAN":
                        val = "Yes" if attr_val.value_boolean else "No"
                    elif attr_val.attribute.data_type in ("NUMBER", "DECIMAL"):
                        val = float(attr_val.value_number) if attr_val.value_number is not None else None
                    else:
                        val = attr_val.value_text
                    if val:
                        attrs.append(str(val))
                if attrs:
                    product_name = f"{product.name} ({', '.join(attrs)})"
        elif item:
            product_name = item.inventory_code

        sku = (item.sku if item and item.sku else "")
        if not sku and product:
            if hasattr(product, "pim_variant") and product.pim_variant and product.pim_variant.sku:
                sku = product.pim_variant.sku
            elif product.product_code:
                sku = product.product_code

        q_in = Decimal(str(row.quantity_in or "0"))
        q_out = Decimal(str(row.quantity_out or "0"))
        mv_qty = q_in if q_in > Decimal("0") else q_out
        unit_prod_cost = Decimal(str(costing.get("product_cost") or "0.00"))
        unit_acc_cost = Decimal(str(costing.get("accessories_cost") or "0.00"))
        unit_all_acc_cost = Decimal(str(costing.get("all_accessories_cost") or "0.00"))
        unit_total_cost = Decimal(str(costing.get("total_cost") or "0.00"))
        unit_selling = Decimal(str(costing.get("selling_price") or "0.00"))
        unit_net = Decimal(str(costing.get("net_profit") or "0.00"))

        results.append(
            {
                "id": row.id,
                "product_id": product.id if product else None,
                "product_name": product_name,
                "product_code": product.product_code if product else "",
                "sku": sku,
                "barcode": item.barcode if item else "",
                "movement_type": row.movement_type,
                "quantity_in": str(row.quantity_in or Decimal("0")),
                "quantity_out": str(row.quantity_out or Decimal("0")),
                "movement_date": row.movement_date.isoformat() if row.movement_date else None,
                "stock_location": row.stock_location.name if row.stock_location else row.warehouse_name or "",
                "reference_model": row.reference_model or "",
                "reference_id": row.reference_id,
                "notes": row.notes or "",
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "product_cost": f"{unit_prod_cost:.2f}",
                "accessories_cost": f"{unit_acc_cost:.2f}",
                "all_accessories_cost": f"{unit_all_acc_cost:.2f}",
                "total_cost": f"{unit_total_cost:.2f}",
                "selling_price": f"{unit_selling:.2f}",
                "net_profit": f"{unit_net:.2f}",
                "profit_margin_percent": costing.get("profit_margin_percent", "0.00"),
                "accessories_count": costing.get("accessories_count", 0),
                "movement_total_cost": f"{(unit_total_cost * mv_qty).quantize(Decimal('0.01')):.2f}",
                "movement_selling_value": f"{(unit_selling * mv_qty).quantize(Decimal('0.01')):.2f}",
                "movement_net_profit": f"{(unit_net * mv_qty).quantize(Decimal('0.01')):.2f}",
            }
        )

    period = (
        f"{date_from or 'start'} to {date_to or 'today'}"
        if (date_from or date_to)
        else "all time"
    )

    page_cost_total = sum((Decimal(r["movement_total_cost"]) for r in results), Decimal("0.00"))
    page_selling_total = sum((Decimal(r["movement_selling_value"]) for r in results), Decimal("0.00"))
    page_net_total = (page_selling_total - page_cost_total).quantize(Decimal("0.01"))
    page_margin_pct = (
        ((page_net_total / page_selling_total) * Decimal("100")).quantize(Decimal("0.01"))
        if page_selling_total > Decimal("0.00")
        else Decimal("0.00")
    )

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "has_next": page < num_pages,
        "has_previous": page > 1 and num_pages > 0,
        "range_start": start + 1 if results else 0,
        "range_end": start + len(results),
        "summary": {
            "total_inbound": str(total_inbound),
            "total_outbound": str(total_outbound),
            "net_change": str(net_change),
            "period": period,
            "page_total_cost": f"{page_cost_total:.2f}",
            "page_total_selling": f"{page_selling_total:.2f}",
            "page_net_profit": f"{page_net_total:.2f}",
            "page_margin_percent": f"{page_margin_pct:.2f}",
        },
        "results": results,
    }


def export_ledger_csv(
    search_query: str = "",
    movement_type_filter: str = "",
    reference_model_filter: str = "",
    date_from: str = "",
    date_to: str = "",
    inventory_item_id: str = "",
):
    qs = _base_qs()

    if inventory_item_id:
        qs = qs.filter(inventory_item_id=inventory_item_id)

    if search_query:
        qs = qs.filter(
            Q(inventory_item__product__name__icontains=search_query)
            | Q(inventory_item__sku__icontains=search_query)
            | Q(warehouse_name__icontains=search_query)
        )
    if movement_type_filter:
        qs = qs.filter(movement_type=movement_type_filter.upper())
    if reference_model_filter:
        qs = qs.filter(reference_model__iexact=reference_model_filter)
    if date_from:
        qs = qs.filter(movement_date__gte=date_from)
    if date_to:
        qs = qs.filter(movement_date__lte=date_to)

    rows = []
    costing_cache = {}
    for row in qs.order_by("-movement_date", "-id"):
        item = row.inventory_item
        product = item.product if item else None

        if item and item.id not in costing_cache:
            costing_cache[item.id] = compute_product_costing_summary(inventory_item=item)
        elif not item and None not in costing_cache:
            costing_cache[None] = compute_product_costing_summary()
        costing = costing_cache.get(item.id if item else None) or {}
        
        product_name = ""
        if product:
            product_name = product.name
            if hasattr(product, "pim_variant") and product.pim_variant:
                attrs = []
                for attr_val in product.pim_variant.attribute_values.all():
                    if attr_val.attribute.data_type == "BOOLEAN":
                        val = "Yes" if attr_val.value_boolean else "No"
                    elif attr_val.attribute.data_type in ("NUMBER", "DECIMAL"):
                        val = float(attr_val.value_number) if attr_val.value_number is not None else None
                    else:
                        val = attr_val.value_text
                    if val:
                        attrs.append(str(val))
                if attrs:
                    product_name = f"{product.name} ({', '.join(attrs)})"
        elif item:
            product_name = item.inventory_code

        rows.append(
            {
                "Date": row.movement_date.isoformat() if row.movement_date else "",
                "Product Code": product.product_code if product else "",
                "Product Name": product_name,
                "SKU": item.sku if item else "",
                "Movement Type": row.movement_type,
                "Qty In": str(row.quantity_in or ""),
                "Qty Out": str(row.quantity_out or ""),
                "Product Cost": costing.get("product_cost", "0.00"),
                "Accessories Cost": costing.get("accessories_cost", "0.00"),
                "Total Cost": costing.get("total_cost", "0.00"),
                "Selling Price": costing.get("selling_price", "0.00"),
                "Net Profit": costing.get("net_profit", "0.00"),
                "Profit %": costing.get("profit_margin_percent", "0.00"),
                "Qty Out": str(row.quantity_out or ""),
                "Location": row.stock_location.name if row.stock_location else row.warehouse_name or "",
                "Reference": row.reference_model or "",
                "Reference ID": str(row.reference_id) if row.reference_id else "",
                "Notes": row.notes or "",
            }
        )
    return rows
