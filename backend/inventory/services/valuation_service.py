from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum, DecimalField, F, Case, When, Value
from django.db.models.functions import Coalesce

from inventory.models import InventoryItem, InventoryValuation, InventoryValuationMethod, StockLedger


def _decimal(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def weighted_average_unit_cost(item: InventoryItem, *, as_of_date: date | None = None) -> Decimal:
    """Company valuation policy: Weighted Average Cost over persisted purchase
    bill lines (optionally only bills dated on/before ``as_of_date`` so a
    historical stock-out values deterministically), falling back to the item's
    standard unit cost when no purchase history exists."""
    total_cost = Decimal("0.00")
    total_quantity = Decimal("0.000")
    lines = item.purchase_bill_lines.all()
    if as_of_date is not None:
        lines = lines.select_related("purchase_bill").filter(purchase_bill__bill_date__lte=as_of_date)
    for line in lines:
        quantity = Decimal(str(line.quantity or "0.000"))
        total_quantity += quantity
        total_cost += quantity * Decimal(str(line.unit_cost or "0.00"))
    if total_quantity <= 0:
        return _decimal(item.standard_unit_cost)
    return (total_cost / total_quantity).quantize(Decimal("0.01"))


def _latest_weighted_cost(item: InventoryItem) -> Decimal:
    return weighted_average_unit_cost(item)


def _calculate_on_hand_qty_bulk(item: InventoryItem, stock_location_id: int | None = None) -> Decimal:
    """On-hand quantity for a single item, matching the canonical stock formula.

    Canonical (see inventory.services.stock_service): on-hand =
    opening_stock_qty + Sum(quantity_in) - Sum(quantity_out), aggregated over
    StockLedger while EXCLUDING soft-hold movements (reservations etc.). Omitting
    either piece understated inventory valuation for opening-balance-only items.
    """
    from django.db.models import Q as DjangoQ
    from inventory.models import SOFT_HOLD_MOVEMENT_TYPES

    ledger_filter = DjangoQ(inventory_item_id=item.id)
    if stock_location_id:
        ledger_filter &= DjangoQ(stock_location_id=stock_location_id)

    result = (
        StockLedger.objects.filter(ledger_filter)
        .exclude(movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES))
        .aggregate(
            total_in=Sum('quantity_in', output_field=DecimalField()),
            total_out=Sum('quantity_out', output_field=DecimalField()),
        )
    )

    total_in = result['total_in'] or Decimal("0.000")
    total_out = result['total_out'] or Decimal("0.000")
    opening = Decimal(str(item.opening_stock_qty or "0.000"))
    return total_in - total_out + opening


def build_inventory_valuation(
    *,
    as_of_date: date | None = None,
    search: str | None = None,
    category: str | None = None,
    exclude_zero: bool = False,
    stock_location_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
):
    if isinstance(as_of_date, str):
        effective_date = date.fromisoformat(as_of_date)
    else:
        effective_date = as_of_date or date.today()

    rows = []
    total_value = Decimal("0.00")
    total_count = 0

    queryset = (
        InventoryItem.objects.select_related("product")
        .filter(is_active=True)
    )

    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) | Q(sku__icontains=search) | Q(product__product_code__icontains=search)
        )
    if category:
        queryset = queryset.filter(product__category__iexact=category)

    queryset = queryset.order_by("product__name", "id")

    # First pass: calculate totals across all filtered items
    all_items = list(queryset)
    temp_rows = []

    for item in all_items:
        on_hand = _calculate_on_hand_qty_bulk(item, stock_location_id)
        if exclude_zero and on_hand <= Decimal("0.000"):
            continue
        unit_cost = _latest_weighted_cost(item)
        stock_value = (Decimal(str(on_hand)) * unit_cost).quantize(Decimal("0.01"))
        total_value += stock_value

        temp_rows.append({
            "inventory_item_id": item.id,
            "product_code": item.product.product_code,
            "product_name": item.product.name,
            "sku": item.sku,
            "valuation_method": item.valuation_method,
            "as_of_date": effective_date.isoformat(),
            "on_hand_qty": f"{on_hand:.3f}",
            "unit_cost": f"{unit_cost:.2f}",
            "stock_value": f"{stock_value:.2f}",
        })

    total_count = len(temp_rows)

    # Apply pagination to temp_rows
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    rows = temp_rows[start_idx:end_idx]

    num_pages = (total_count + page_size - 1) // page_size

    return {
        "as_of_date": effective_date.isoformat(),
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "total_value": f"{total_value:.2f}",
        "rows": rows,
    }


def build_inventory_valuation_csv(
    *,
    as_of_date: date | None = None,
    search: str | None = None,
    category: str | None = None,
    exclude_zero: bool = False,
    stock_location_id: int | None = None,
) -> str:
    """Generate CSV export of the complete filtered inventory valuation."""
    if isinstance(as_of_date, str):
        effective_date = date.fromisoformat(as_of_date)
    else:
        effective_date = as_of_date or date.today()

    rows = []
    total_value = Decimal("0.00")

    queryset = (
        InventoryItem.objects.select_related("product")
        .filter(is_active=True)
    )

    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) | Q(sku__icontains=search) | Q(product__product_code__icontains=search)
        )
    if category:
        queryset = queryset.filter(product__category__iexact=category)

    queryset = queryset.order_by("product__name", "id")

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)

    # Write header
    writer.writerow([
        "Product Code",
        "Product Name",
        "SKU",
        "Valuation Method",
        "On Hand Qty",
        "Unit Cost",
        "Stock Value",
    ])

    # Write data rows
    for item in queryset:
        on_hand = _calculate_on_hand_qty_bulk(item, stock_location_id)
        if exclude_zero and on_hand <= Decimal("0.000"):
            continue
        unit_cost = _latest_weighted_cost(item)
        stock_value = (Decimal(str(on_hand)) * unit_cost).quantize(Decimal("0.01"))
        total_value += stock_value

        writer.writerow([
            item.product.product_code,
            item.product.name,
            item.sku or "",
            item.valuation_method,
            f"{on_hand:.3f}",
            f"{unit_cost:.2f}",
            f"{stock_value:.2f}",
        ])

    # Write summary row
    writer.writerow([])
    writer.writerow(["Total Stock Value", f"{total_value:.2f}"])
    writer.writerow(["As Of Date", effective_date.isoformat()])

    return csv_buffer.getvalue()


@transaction.atomic
def create_inventory_valuation_snapshot(*, as_of_date: date | None = None, created_by=None):
    payload = build_inventory_valuation(as_of_date=as_of_date)
    snapshot = InventoryValuation.objects.create(
        as_of_date=date.fromisoformat(payload["as_of_date"]),
        # The builder above values stock at weighted average cost, so record AVG
        # (the previous hardcoded "FIFO" label misstated the method actually used).
        method=InventoryValuationMethod.AVG,
        totals_json=payload,
        created_by=created_by,
    )
    return snapshot
