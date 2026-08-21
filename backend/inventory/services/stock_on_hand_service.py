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

from inventory.models import InventoryItem, SOFT_HOLD_MOVEMENT_TYPES

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

    value_qs = qs.values("standard_unit_cost", "physical_qty")
    
    total_physical = Decimal("0")
    total_value = Decimal("0")
    
    for row in value_qs:
        qty = row["physical_qty"] or Decimal("0")
        total_physical += qty
        
        if qty > 0:
            cost = row["standard_unit_cost"] or Decimal("0")
            total_value += cost * qty

    # StockReservation integration is a future phase; treat reserved as 0 for now
    total_reserved = Decimal("0")
    total_available = total_physical - total_reserved

    # Critical shortages list
    critical_shortages = []
    for item in _critical_qs():
        shortage = (item.reorder_level_qty or Decimal("0")) - item.physical_qty
        critical_shortages.append(
            {
                "product_id": item.product_id,
                "product_code": item.product.product_code if item.product else "",
                "product_name": item.product.name if item.product else item.inventory_code,
                "sku": item.sku or "",
                "physical_qty": str(item.physical_qty),
                "reserved_qty": "0",
                "reorder_point": str(item.reorder_level_qty or Decimal("0")),
                "shortage_qty": str(shortage),
            }
        )

    return {
        "summary": {
            "total_physical_qty": str(total_physical),
            "total_reserved_qty": "0",
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
    items = qs[start : start + page_size]

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
                "reserved_qty": "0",
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
