from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from inventory.models import StockMovementType
from inventory.services.audit_service import log_inventory_event
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog, DeliveryStatus


@transaction.atomic
def sync_delivery_inventory_bridge(*, delivery, performed_by=None) -> dict:
    subscription = delivery.subscription
    product = subscription.product
    inventory_item = getattr(product, "inventory_profile", None)

    if inventory_item is None or not inventory_item.stock_tracking_enabled:
        return {"created": False, "skipped": True, "reason": "inventory_not_tracked"}
    if not inventory_item.delivery_stock_bridge_enabled:
        return {"created": False, "skipped": True, "reason": "delivery_bridge_disabled"}

    movement_type = None
    quantity_in = Decimal("0.000")
    quantity_out = Decimal("0.000")

    if delivery.status == DeliveryStatus.DELIVERED:
        movement_type = StockMovementType.EMI_DELIVERY_OUT
        quantity_out = Decimal("1.000")
    elif delivery.status == DeliveryStatus.RETURNED:
        movement_type = StockMovementType.EMI_RETURN_IN
        quantity_in = Decimal("1.000")
    else:
        return {"created": False, "skipped": True, "reason": "status_not_stock_relevant"}

    entry, created = create_stock_ledger_entry(
        inventory_item=inventory_item,
        movement_type=movement_type,
        movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
        stock_location=inventory_item.default_stock_location,
        quantity_in=quantity_in,
        quantity_out=quantity_out,
        reference_model="SubscriptionDelivery",
        reference_id=str(delivery.id),
        notes=delivery.delivery_reference or "",
        posted_by=performed_by,
    )

    log_inventory_event(
        action_type=AuditLog.ActionType.DELIVERY_INVENTORY_BRIDGE_SYNCED,
        instance=delivery,
        performed_by=performed_by,
        event="DELIVERY_INVENTORY_BRIDGE",
        metadata={
            "delivery_id": delivery.id,
            "subscription_id": subscription.id,
            "inventory_item_id": inventory_item.id,
            "movement_type": movement_type,
            "stock_ledger_id": entry.id,
            "created": created,
        },
    )

    return {
        "created": created,
        "stock_ledger_id": entry.id,
        "movement_type": movement_type,
    }
