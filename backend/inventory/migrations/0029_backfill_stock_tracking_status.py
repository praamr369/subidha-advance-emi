"""Re-derive InventoryItem.stock_tracking_status from actual stock.

The column was only refreshed when an inventory profile was (re)prepared, never
when stock moved, so items that received stock kept showing PREPARED_NO_STOCK.
StockLedger.save now keeps it in sync; this corrects the rows already stale.

Only the PREPARED_NO_STOCK <-> STOCK_ACTIVE pair is touched. Manual lifecycle
states (INACTIVE / ARCHIVED / NOT_PREPARED) are left alone. No stock rows change.
"""
from decimal import Decimal

from django.db import migrations
from django.db.models import Q, Sum

# Frozen copy of inventory.models.SOFT_HOLD_MOVEMENT_TYPES.
SOFT_HOLDS = [
    "SALE_RESERVE",
    "SALE_RELEASE",
    "MAINTENANCE_HOLD",
    "MAINTENANCE_RELEASE",
    "QUALITY_HOLD",
    "QUALITY_RELEASE",
]
STOCK_STATES = ("PREPARED_NO_STOCK", "STOCK_ACTIVE")
ZERO = Decimal("0.000")


def forwards(apps, schema_editor):
    InventoryItem = apps.get_model("inventory", "InventoryItem")
    items = InventoryItem.objects.filter(stock_tracking_status__in=STOCK_STATES).annotate(
        _in=Sum("stock_ledger__quantity_in", filter=~Q(stock_ledger__movement_type__in=SOFT_HOLDS)),
        _out=Sum("stock_ledger__quantity_out", filter=~Q(stock_ledger__movement_type__in=SOFT_HOLDS)),
    )
    for item in items.iterator():
        qty = (item.opening_stock_qty or ZERO) + (item._in or ZERO) - (item._out or ZERO)
        target = "STOCK_ACTIVE" if qty > ZERO else "PREPARED_NO_STOCK"
        if item.stock_tracking_status != target:
            InventoryItem.objects.filter(pk=item.pk).update(stock_tracking_status=target)


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0028_relabel_rent_lease_delivery_movements"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
