"""Relabel historical rent/lease handover and return stock movements.

Every SubscriptionDelivery-sourced stock row used to be written as
EMI_DELIVERY_OUT / EMI_RETURN_IN regardless of plan type, so rent and lease
handovers looked like EMI sales. That made them eligible for COGS posting and
hid them from rent-asset reporting.

This only changes the movement_type LABEL. Quantities, dates, locations and
references are untouched, so every on-hand balance and valuation is identical
before and after — the rows are reclassified, not restated.
"""
from django.db import migrations

HANDOVER_OUT_BY_PLAN = {
    "RENT": "RENT_HANDOVER_OUT",
    "LEASE": "LEASE_HANDOVER_OUT",
}
RETURN_IN_BY_PLAN = {
    "RENT": "RENT_RETURN_IN",
    "LEASE": "LEASE_RETURN_IN",
}
OLD_OUT = {"EMI_DELIVERY_OUT", "DELIVERY_OUT"}
OLD_IN = {"EMI_RETURN_IN"}


def _relabel(apps, schema_editor, *, forward: bool):
    StockLedger = apps.get_model("inventory", "StockLedger")
    SubscriptionDelivery = apps.get_model("deliveries", "SubscriptionDelivery")

    rows = StockLedger.objects.filter(reference_model="SubscriptionDelivery")
    for row in rows.iterator():
        try:
            delivery_pk = int(row.reference_id)
        except (TypeError, ValueError):
            continue
        delivery = (
            SubscriptionDelivery.objects.filter(pk=delivery_pk)
            .select_related("subscription")
            .first()
        )
        if delivery is None or delivery.subscription is None:
            continue
        plan = delivery.subscription.plan_type
        if plan not in HANDOVER_OUT_BY_PLAN:
            continue

        is_out = (row.quantity_out or 0) > 0
        if forward:
            target = HANDOVER_OUT_BY_PLAN[plan] if is_out else RETURN_IN_BY_PLAN[plan]
            stale = row.movement_type in (OLD_OUT if is_out else OLD_IN)
        else:
            target = "EMI_DELIVERY_OUT" if is_out else "EMI_RETURN_IN"
            stale = row.movement_type in (
                set(HANDOVER_OUT_BY_PLAN.values()) if is_out else set(RETURN_IN_BY_PLAN.values())
            )
        if stale and row.movement_type != target:
            row.movement_type = target
            row.save(update_fields=["movement_type"])


def forwards(apps, schema_editor):
    _relabel(apps, schema_editor, forward=True)


def backwards(apps, schema_editor):
    _relabel(apps, schema_editor, forward=False)


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0027_alter_stockledger_movement_type"),
        ("deliveries", "0003_add_admin_override_to_delivery"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
