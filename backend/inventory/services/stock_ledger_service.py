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

# Movement types that count as inbound / outbound for KPI summary
_INBOUND_TYPES = {
    "OPENING_BALANCE_IN", "PURCHASE_IN", "PURCHASE_RECEIVE",
    "EMI_RETURN_IN", "CUSTOMER_RETURN", "SALE_RETURN_IN",
    "PRODUCTION_RETURN_IN", "PRODUCTION_RECEIPT_IN", "PRODUCTION_OUTPUT",
    "ADJUSTMENT_IN", "TRANSFER_IN", "MAINTENANCE_RELEASE",
    "QUALITY_RELEASE",
}
_OUTBOUND_TYPES = {
    "SALE_OUT", "EMI_DELIVERY_OUT", "DELIVERY_OUT",
    "PRODUCTION_ISSUE_OUT", "PRODUCTION_CONSUME",
    "PURCHASE_RETURN_OUT", "VENDOR_RETURN", "ADJUSTMENT_OUT",
    "TRANSFER_OUT", "DAMAGE", "MAINTENANCE_HOLD", "QUALITY_HOLD",
}


def _base_qs():
    return StockLedger.objects.select_related(
        "inventory_item",
        "inventory_item__product",
        "stock_location",
    )


def build_stock_ledger_list(
    search_query: str = "",
    movement_type_filter: str = "",
    reference_model_filter: str = "",
    date_from: str = "",
    date_to: str = "",
    page: int = 1,
    page_size: int = 50,
):
    qs = _base_qs()

    if search_query:
        qs = qs.filter(
            Q(inventory_item__product__name__icontains=search_query)
            | Q(inventory_item__product__product_code__icontains=search_query)
            | Q(inventory_item__sku__icontains=search_query)
            | Q(inventory_item__barcode__icontains=search_query)
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
    for row in page_qs:
        item = row.inventory_item
        product = item.product if item else None
        results.append(
            {
                "id": row.id,
                "product_id": product.id if product else None,
                "product_name": product.name if product else (item.inventory_code if item else ""),
                "product_code": product.product_code if product else "",
                "sku": item.sku if item else "",
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
            }
        )

    period = (
        f"{date_from or 'start'} to {date_to or 'today'}"
        if (date_from or date_to)
        else "all time"
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
        },
        "results": results,
    }


def export_ledger_csv(
    search_query: str = "",
    movement_type_filter: str = "",
    reference_model_filter: str = "",
    date_from: str = "",
    date_to: str = "",
):
    qs = _base_qs()

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
    for row in qs.order_by("-movement_date", "-id"):
        item = row.inventory_item
        product = item.product if item else None
        rows.append(
            {
                "Date": row.movement_date.isoformat() if row.movement_date else "",
                "Product Code": product.product_code if product else "",
                "Product Name": product.name if product else (item.inventory_code if item else ""),
                "SKU": item.sku if item else "",
                "Movement Type": row.movement_type,
                "Qty In": str(row.quantity_in or ""),
                "Qty Out": str(row.quantity_out or ""),
                "Location": row.stock_location.name if row.stock_location else row.warehouse_name or "",
                "Reference": row.reference_model or "",
                "Reference ID": str(row.reference_id) if row.reference_id else "",
                "Notes": row.notes or "",
            }
        )
    return rows
