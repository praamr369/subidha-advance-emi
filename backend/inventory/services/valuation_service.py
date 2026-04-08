from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from inventory.models import InventoryItem, InventoryValuation


def _decimal(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def _latest_weighted_cost(item: InventoryItem) -> Decimal:
    total_cost = Decimal("0.00")
    total_quantity = Decimal("0.000")
    for line in item.purchase_bill_lines.all():
        quantity = Decimal(str(line.quantity or "0.000"))
        total_quantity += quantity
        total_cost += quantity * Decimal(str(line.unit_cost or "0.00"))
    if total_quantity <= 0:
        return _decimal(item.standard_unit_cost)
    return (total_cost / total_quantity).quantize(Decimal("0.01"))


def build_inventory_valuation(*, as_of_date: date | None = None):
    if isinstance(as_of_date, str):
        effective_date = date.fromisoformat(as_of_date)
    else:
        effective_date = as_of_date or date.today()
    rows = []
    total_value = Decimal("0.00")
    queryset = (
        InventoryItem.objects.select_related("product")
        .prefetch_related("purchase_bill_lines")
        .all()
        .order_by("product__name", "id")
    )
    for item in queryset:
        on_hand = item.current_stock_quantity()
        unit_cost = _latest_weighted_cost(item)
        stock_value = (Decimal(str(on_hand)) * unit_cost).quantize(Decimal("0.01"))
        total_value += stock_value
        rows.append(
            {
                "inventory_item_id": item.id,
                "product_code": item.product.product_code,
                "product_name": item.product.name,
                "sku": item.sku,
                "valuation_method": item.valuation_method,
                "as_of_date": effective_date.isoformat(),
                "on_hand_qty": f"{on_hand:.3f}",
                "unit_cost": f"{unit_cost:.2f}",
                "stock_value": f"{stock_value:.2f}",
            }
        )

    return {
        "as_of_date": effective_date.isoformat(),
        "count": len(rows),
        "total_value": f"{total_value:.2f}",
        "rows": rows,
    }


@transaction.atomic
def create_inventory_valuation_snapshot(*, as_of_date: date | None = None, created_by=None):
    payload = build_inventory_valuation(as_of_date=as_of_date)
    snapshot = InventoryValuation.objects.create(
        as_of_date=date.fromisoformat(payload["as_of_date"]),
        method="FIFO",
        totals_json=payload,
        created_by=created_by,
    )
    return snapshot
