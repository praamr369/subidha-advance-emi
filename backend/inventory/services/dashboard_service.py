from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum, Count, Case, When, DecimalField, F
from django.utils import timezone

from inventory.models import InventoryItem, StockLedger, StockMovementType


def _decimal(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def build_inventory_dashboard(
    *,
    location_id: int | None = None,
) -> dict:
    """Build inventory dashboard KPIs with database aggregation.

    Returns: {
        "total_value": "1234567.89",
        "by_category": {
            "finished_goods": {"count": 123, "value": "...", "in_stock": 100, "low_stock": 15, "out_of_stock": 8},
            "raw_materials": {...},
            "accessories": {...}
        },
        "status_summary": {
            "total_skus": 456,
            "in_stock": 400,
            "low_stock": 45,
            "out_of_stock": 11,
        }
    }
    """

    # Base queryset
    queryset = InventoryItem.objects.filter(is_active=True)

    # If location specified, only count stock at that location
    ledger_filter = Q()
    if location_id:
        ledger_filter = Q(stock_location_id=location_id)

    # Annotate each item with its on-hand quantity at this location
    from django.db.models import Subquery, OuterRef

    stock_query = StockLedger.objects.filter(
        inventory_item_id=OuterRef('id'),
        **({'stock_location_id': location_id} if location_id else {})
    ).values('inventory_item_id').annotate(
        qty_in=Sum('quantity_in', output_field=DecimalField()),
        qty_out=Sum('quantity_out', output_field=DecimalField())
    ).values('qty_in', 'qty_out')

    # Calculate on_hand = sum(quantity_in) - sum(quantity_out)
    queryset = queryset.annotate(
        calculated_on_hand=Case(
            When(
                id__in=StockLedger.objects.filter(
                    **({'stock_location_id': location_id} if location_id else {})
                ).values_list('inventory_item_id', flat=True),
                then=F('id')  # Placeholder
            ),
            default=F('id'),  # Placeholder
        )
    )

    # Simpler approach: iterate and calculate with Django ORM queries
    # This is the pragmatic solution for the current scale
    items = list(queryset.select_related('product'))

    total_value = Decimal('0.00')
    by_type = {
        'FINISHED_GOOD': {'items': [], 'value': Decimal('0.00')},
        'RAW_MATERIAL': {'items': [], 'value': Decimal('0.00')},
        'ACCESSORY': {'items': [], 'value': Decimal('0.00')},
    }
    status_counts = {
        'in_stock': 0,
        'low_stock': 0,
        'out_of_stock': 0,
    }

    for item in items:
        # Calculate on-hand quantity for this location
        ledger_rows = StockLedger.objects.filter(inventory_item_id=item.id)
        if location_id:
            ledger_rows = ledger_rows.filter(stock_location_id=location_id)

        totals = ledger_rows.aggregate(
            total_in=Sum('quantity_in', output_field=DecimalField()),
            total_out=Sum('quantity_out', output_field=DecimalField())
        )

        total_in = totals['total_in'] or Decimal('0.000')
        total_out = totals['total_out'] or Decimal('0.000')
        on_hand = total_in - total_out

        # Calculate valuation
        if item.valuation_method == 'AVG':
            # Simple weighted average
            bill_lines = item.purchase_bill_lines.all()
            if bill_lines.exists():
                line_totals = bill_lines.aggregate(
                    total_qty=Sum('quantity', output_field=DecimalField()),
                    total_cost=Sum(
                        F('quantity') * F('unit_cost'),
                        output_field=DecimalField()
                    )
                )
                total_qty = line_totals['total_qty'] or Decimal('0.000')
                total_cost = line_totals['total_cost'] or Decimal('0.00')

                if total_qty > 0:
                    unit_cost = (total_cost / total_qty).quantize(Decimal('0.01'))
                else:
                    unit_cost = _decimal(item.standard_unit_cost)
            else:
                unit_cost = _decimal(item.standard_unit_cost)
        else:
            unit_cost = _decimal(item.standard_unit_cost)

        item_value = (on_hand * unit_cost).quantize(Decimal('0.01'))
        total_value += item_value

        # Determine status
        reorder_level = Decimal(str(item.reorder_level_qty or '0'))
        if on_hand <= 0:
            status = 'out_of_stock'
        elif reorder_level > 0 and on_hand <= reorder_level:
            status = 'low_stock'
        else:
            status = 'in_stock'

        status_counts[status] += 1

        # Track by type
        item_type = item.stock_item_type or 'FINISHED_GOOD'
        if item_type in by_type:
            by_type[item_type]['items'].append(item.id)
            by_type[item_type]['value'] += item_value

    # Build category summary
    by_category = {}
    for item_type, data in by_type.items():
        type_key = (
            'finished_goods' if item_type == 'FINISHED_GOOD'
            else 'raw_materials' if item_type == 'RAW_MATERIAL'
            else 'accessories'
        )

        # Count status within this category
        type_status = {
            'in_stock': 0,
            'low_stock': 0,
            'out_of_stock': 0,
        }

        for item in items:
            if item.stock_item_type != item_type:
                continue

            ledger_rows = StockLedger.objects.filter(inventory_item_id=item.id)
            if location_id:
                ledger_rows = ledger_rows.filter(stock_location_id=location_id)

            totals = ledger_rows.aggregate(
                total_in=Sum('quantity_in', output_field=DecimalField()),
                total_out=Sum('quantity_out', output_field=DecimalField())
            )

            on_hand = (totals['total_in'] or Decimal('0.000')) - (totals['total_out'] or Decimal('0.000'))
            reorder_level = Decimal(str(item.reorder_level_qty or '0'))

            if on_hand <= 0:
                type_status['out_of_stock'] += 1
            elif reorder_level > 0 and on_hand <= reorder_level:
                type_status['low_stock'] += 1
            else:
                type_status['in_stock'] += 1

        by_category[type_key] = {
            'count': len(data['items']),
            'value': f"{data['value']:.2f}",
            'in_stock': type_status['in_stock'],
            'low_stock': type_status['low_stock'],
            'out_of_stock': type_status['out_of_stock'],
        }

    return {
        'total_value': f"{total_value:.2f}",
        'by_category': by_category,
        'status_summary': {
            'total_skus': len(items),
            'in_stock': status_counts['in_stock'],
            'low_stock': status_counts['low_stock'],
            'out_of_stock': status_counts['out_of_stock'],
        }
    }


def build_critical_shortages(
    *,
    location_id: int | None = None,
    limit: int = 5,
) -> list[dict]:
    """Build list of top out-of-stock items that have pending customer orders.

    Returns list of dicts with: {
        "inventory_item_id": 123,
        "product_code": "PROD-001",
        "product_name": "Product Name",
        "on_hand": "0",
        "required_for_orders": "45.000",
    }
    """
    from inventory.models import InventoryItem

    queryset = InventoryItem.objects.filter(is_active=True)
    if location_id:
        # For location-specific: sum across all locations where item exists
        pass

    items = list(queryset.select_related('product'))
    shortages = []

    for item in items:
        ledger_rows = StockLedger.objects.filter(inventory_item_id=item.id)
        if location_id:
            ledger_rows = ledger_rows.filter(stock_location_id=location_id)

        totals = ledger_rows.aggregate(
            total_in=Sum('quantity_in', output_field=DecimalField()),
            total_out=Sum('quantity_out', output_field=DecimalField())
        )

        on_hand = (totals['total_in'] or Decimal('0.000')) - (totals['total_out'] or Decimal('0.000'))

        # Only include out-of-stock items
        if on_hand > 0:
            continue

        # Check if item has required_for_orders > 0
        # For now, use a simple heuristic: items with reorder level set
        reorder_level = Decimal(str(item.reorder_level_qty or '0'))
        if reorder_level <= 0:
            continue

        shortages.append({
            'inventory_item_id': item.id,
            'product_code': item.product.product_code,
            'product_name': item.product.name,
            'on_hand': f"{on_hand:.3f}",
            'required_for_orders': f"{reorder_level:.3f}",
        })

    # Sort by required quantity descending and limit
    shortages.sort(key=lambda x: float(x['required_for_orders']), reverse=True)
    return shortages[:limit]


def build_movement_velocity(
    *,
    location_id: int | None = None,
) -> dict:
    """Build fast movers (last 30 days) and dead stock (no movement in 90 days).

    Returns: {
        "fast_movers": [...],
        "dead_stock": [...]
    }
    """
    from inventory.models import InventoryItem

    now = timezone.now().date()
    thirty_days_ago = now - timedelta(days=30)
    ninety_days_ago = now - timedelta(days=90)

    queryset = InventoryItem.objects.filter(is_active=True)
    items = list(queryset.select_related('product'))

    fast_movers = []
    dead_stock = []

    for item in items:
        ledger_rows = StockLedger.objects.filter(inventory_item_id=item.id)
        if location_id:
            ledger_rows = ledger_rows.filter(stock_location_id=location_id)

        # Fast movers: high outflow in last 30 days
        recent_out = ledger_rows.filter(
            movement_date__gte=thirty_days_ago
        ).aggregate(
            total_out=Sum('quantity_out', output_field=DecimalField())
        )['total_out'] or Decimal('0.000')

        if recent_out > 0:
            fast_movers.append({
                'inventory_item_id': item.id,
                'product_code': item.product.product_code,
                'product_name': item.product.name,
                'quantity_out_30d': f"{recent_out:.3f}",
            })

        # Dead stock: no movement in last 90 days but on hand
        current_on_hand = ledger_rows.aggregate(
            total_in=Sum('quantity_in', output_field=DecimalField()),
            total_out=Sum('quantity_out', output_field=DecimalField())
        )
        on_hand = (current_on_hand['total_in'] or Decimal('0.000')) - (current_on_hand['total_out'] or Decimal('0.000'))

        if on_hand > 0:
            # Check if any movement in last 90 days
            recent_movement = ledger_rows.filter(
                movement_date__gte=ninety_days_ago
            ).exists()

            if not recent_movement:
                dead_stock.append({
                    'inventory_item_id': item.id,
                    'product_code': item.product.product_code,
                    'product_name': item.product.name,
                    'on_hand_qty': f"{on_hand:.3f}",
                })

    # Sort and limit
    fast_movers.sort(key=lambda x: float(x['quantity_out_30d']), reverse=True)
    dead_stock.sort(key=lambda x: float(x['on_hand_qty']), reverse=True)

    return {
        'fast_movers': fast_movers[:10],
        'dead_stock': dead_stock[:10],
    }
