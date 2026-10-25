from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from inventory.models import (
    HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN,
    RETURN_IN_MOVEMENT_TYPE_BY_PLAN,
    StockMovementType,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog, DeliveryStatus


@transaction.atomic
def sync_delivery_inventory_bridge(*, delivery, performed_by=None) -> dict:
    subscription = delivery.subscription
    plan_type = str(getattr(subscription, "plan_type", "") or "")

    movement_type = None
    is_outflow = False
    is_inflow = False

    if delivery.status == DeliveryStatus.DELIVERED:
        movement_type = HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN.get(
            plan_type, StockMovementType.EMI_DELIVERY_OUT
        )
        is_outflow = True
    elif delivery.status == DeliveryStatus.RETURNED:
        movement_type = RETURN_IN_MOVEMENT_TYPE_BY_PLAN.get(
            plan_type, StockMovementType.EMI_RETURN_IN
        )
        is_inflow = True
    else:
        return {"created": False, "skipped": True, "reason": "status_not_stock_relevant"}

    # Build the list of (product, quantity) to move
    batch_items = list(delivery.delivery_items.select_related("product").all()) if hasattr(delivery, "delivery_items") else []
    items_to_move: list[tuple] = []
    if batch_items:
        for d_item in batch_items:
            items_to_move.append((d_item.product, Decimal(str(d_item.quantity))))
    elif subscription.product:
        items_to_move.append((subscription.product, Decimal("1.000")))

    if not items_to_move:
        return {"created": False, "skipped": True, "reason": "no_products_to_move"}

    entries_created = 0
    last_entry_id = None

    for product, qty in items_to_move:
        inventory_item = getattr(product, "inventory_profile", None)
        if inventory_item is None or not inventory_item.stock_tracking_enabled:
            continue
        if not inventory_item.delivery_stock_bridge_enabled:
            continue

        q_in = qty if is_inflow else Decimal("0.000")
        q_out = qty if is_outflow else Decimal("0.000")

        ref_id = f"{delivery.id}-{product.id}" if len(items_to_move) > 1 else str(delivery.id)

        entry, created = create_stock_ledger_entry(
            inventory_item=inventory_item,
            movement_type=movement_type,
            movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
            stock_location=inventory_item.default_stock_location,
            quantity_in=q_in,
            quantity_out=q_out,
            reference_model="SubscriptionDelivery",
            reference_id=ref_id,
            notes=f"{delivery.delivery_reference} (Batch #{delivery.batch_number})",
            posted_by=performed_by,
        )

        if created:
            entries_created += 1
            last_entry_id = entry.id

            log_inventory_event(
                action_type=AuditLog.ActionType.DELIVERY_INVENTORY_BRIDGE_SYNCED,
                instance=delivery,
                performed_by=performed_by,
                event="DELIVERY_INVENTORY_BRIDGE",
                metadata={
                    "delivery_id": delivery.id,
                    "batch_number": getattr(delivery, "batch_number", 1),
                    "subscription_id": subscription.id,
                    "product_id": product.id,
                    "inventory_item_id": inventory_item.id,
                    "quantity": str(qty),
                    "movement_type": movement_type,
                    "plan_type": plan_type,
                    "stock_ledger_id": entry.id,
                    "created": created,
                },
            )

    return {
        "created": entries_created > 0,
        "entries_created": entries_created,
        "stock_ledger_id": last_entry_id,
        "movement_type": movement_type,
    }
