"""
Lot Tracking Enterprise Service

InventoryLot model fields (after restructure):
  inventory_item   FK → InventoryItem → product (Product)
  stock_location   FK → StockLocation
  quantity_on_hand DecimalField (was: quantity)
  source_model     CharField  (Django model name of the source document)
  source_id        CharField  (PK of the source document)
  barcode, lot_code, status, received_date, expiry_date — unchanged
  (no more: product FK, warehouse FK, quantity, reorder_point, source, priority)
"""

from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce

from inventory.models import InventoryLot


def _base_qs():
    return InventoryLot.objects.select_related(
        "inventory_item",
        "inventory_item__product",
        "stock_location",
    )


def build_lot_tracking_list(
    search_query: str = "",
    status_filter: str = "",
    source_model_filter: str = "",
    page: int = 1,
    page_size: int = 50,
):
    qs = _base_qs()

    if search_query:
        qs = qs.filter(
            Q(lot_code__icontains=search_query)
            | Q(inventory_item__product__name__icontains=search_query)
            | Q(inventory_item__product__product_code__icontains=search_query)
            | Q(inventory_item__sku__icontains=search_query)
            | Q(barcode__icontains=search_query)
        )

    if status_filter:
        qs = qs.filter(status=status_filter.upper())

    if source_model_filter:
        qs = qs.filter(source_model__iexact=source_model_filter)

    # KPI summary (before pagination)
    summary_agg = qs.aggregate(
        total_lots=Count("id"),
        active_lots=Count("id", filter=Q(status="ACTIVE")),
        depleted_lots=Count("id", filter=Q(status="DEPLETED")),
        quarantined_lots=Count("id", filter=Q(status="QUARANTINED")),
        expired_lots=Count("id", filter=Q(status="EXPIRED")),
        total_quantity=Coalesce(
            Sum("quantity_on_hand"), Decimal("0"), output_field=DecimalField()
        ),
    )
    summary = {
        "total_lots": summary_agg["total_lots"],
        "active_lots": summary_agg["active_lots"],
        "depleted_lots": summary_agg["depleted_lots"],
        "quarantined_lots": summary_agg["quarantined_lots"],
        "expired_lots": summary_agg["expired_lots"],
        "total_quantity": str(summary_agg["total_quantity"]),
        "critical_shortage_count": qs.filter(
            quantity_on_hand__lte=F("inventory_item__reorder_level_qty")
        ).count(),
    }

    total_count = summary_agg["total_lots"]
    num_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 0
    page = max(1, min(page, num_pages)) if num_pages else 1
    start = (page - 1) * page_size
    page_qs = qs.order_by("-created_at")[start : start + page_size]

    results = []
    for lot in page_qs:
        item = lot.inventory_item
        product = item.product if item else None
        results.append(
            {
                "id": lot.id,
                "lot_code": lot.lot_code,
                "product_id": product.id if product else None,
                "product_name": product.name if product else (item.inventory_code if item else ""),
                "product_code": product.product_code if product else "",
                "sku": item.sku if item else "",
                "barcode": lot.barcode or "",
                "quantity_on_hand": str(lot.quantity_on_hand or Decimal("0")),
                "status": lot.status,
                "source_model": lot.source_model or "",
                "source_id": lot.source_id or "",
                "location_name": lot.stock_location.name if lot.stock_location else "",
                "location_code": lot.stock_location.code if lot.stock_location else "",
                "received_date": lot.received_date.isoformat() if lot.received_date else None,
                "expiry_date": lot.expiry_date.isoformat() if lot.expiry_date else None,
                "created_at": lot.created_at.isoformat() if lot.created_at else None,
                "updated_at": lot.updated_at.isoformat() if lot.updated_at else None,
            }
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
        "summary": summary,
        "results": results,
    }


def export_lots_csv(
    search_query: str = "",
    status_filter: str = "",
    source_model_filter: str = "",
):
    qs = _base_qs()

    if search_query:
        qs = qs.filter(
            Q(lot_code__icontains=search_query)
            | Q(inventory_item__product__name__icontains=search_query)
            | Q(barcode__icontains=search_query)
        )
    if status_filter:
        qs = qs.filter(status=status_filter.upper())
    if source_model_filter:
        qs = qs.filter(source_model__iexact=source_model_filter)

    rows = []
    for lot in qs.order_by("-created_at"):
        item = lot.inventory_item
        product = item.product if item else None
        rows.append(
            {
                "Lot Code": lot.lot_code,
                "Product Code": product.product_code if product else "",
                "Product Name": product.name if product else (item.inventory_code if item else ""),
                "SKU": item.sku if item else "",
                "Barcode": lot.barcode or "",
                "Qty on Hand": str(lot.quantity_on_hand or ""),
                "Status": lot.status,
                "Source Model": lot.source_model or "",
                "Source ID": lot.source_id or "",
                "Location": lot.stock_location.code if lot.stock_location else "",
                "Received": lot.received_date.isoformat() if lot.received_date else "",
                "Expiry": lot.expiry_date.isoformat() if lot.expiry_date else "",
                "Created At": lot.created_at.isoformat() if lot.created_at else "",
            }
        )
    return rows


def auto_generate_lot_code(product_code: str, sequence: int = 1) -> str:
    code = product_code.strip().upper()
    seq = str(sequence).zfill(4)
    return f"LOT-{code}-{seq}"
