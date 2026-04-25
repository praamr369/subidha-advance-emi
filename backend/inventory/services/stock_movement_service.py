"""
StockMovementService – Phase 2

All stock mutations MUST go through this service so every change is captured in
StockLedger with a consistent reference, actor, and reason.

Rules:
- Never create StockLedger rows directly outside this service.
- SALE_RESERVE / SALE_RELEASE are soft holds and do NOT reduce physical stock.
- Delivery completion (post_delivery_out) reduces physical stock AND releases the
  corresponding soft reservation in a single atomic operation.
- No financial ledger entries are created here; accounting bridge is in
  inventory/services/delivery_bridge_service.py.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from inventory.models import (
    InventoryItem,
    SOFT_HOLD_MOVEMENT_TYPES,
    StockLedger,
    StockMovementType,
)

QUANTITY_ZERO = Decimal("0.000")


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


# ---------------------------------------------------------------------------
# Core posting primitive
# ---------------------------------------------------------------------------

@transaction.atomic
def post_movement(
    *,
    inventory_item: InventoryItem,
    movement_type: str,
    quantity: Decimal,
    movement_date=None,
    stock_location=None,
    reference_model: str = "MANUAL",
    reference_id: Optional[int] = None,
    posted_by=None,
    notes: str = "",
) -> StockLedger:
    """
    Create a single StockLedger entry.

    For soft-hold movement types (SALE_RESERVE, MAINTENANCE_HOLD, QUALITY_HOLD)
    the quantity is written to quantity_in.  For the corresponding release types
    (SALE_RELEASE, MAINTENANCE_RELEASE, QUALITY_RELEASE) the quantity is written
    to quantity_out, so that reserved_qty() always = in - out for those types.

    Physical movement types (everything else) set quantity_in for inbound and
    quantity_out for outbound according to the convention below.
    """
    qty = _quantity(quantity)
    if qty <= QUANTITY_ZERO:
        raise ValueError(f"StockMovement quantity must be positive; got {quantity!r}.")

    valid_types = {c[0] for c in StockMovementType.choices}
    if movement_type not in valid_types:
        raise ValueError(f"Unknown StockMovementType: {movement_type!r}.")

    # Determine in/out direction
    outbound_physical_types = {
        StockMovementType.SALE_OUT,
        StockMovementType.EMI_DELIVERY_OUT,
        StockMovementType.DELIVERY_OUT,
        StockMovementType.PRODUCTION_ISSUE_OUT,
        StockMovementType.PRODUCTION_CONSUME,
        StockMovementType.PURCHASE_RETURN_OUT,
        StockMovementType.VENDOR_RETURN,
        StockMovementType.ADJUSTMENT_OUT,
        StockMovementType.STOCK_ADJUSTMENT,  # caller decides sign via movement_type
        StockMovementType.TRANSFER_OUT,
        StockMovementType.DAMAGE,
    }
    release_soft_hold_types = {
        StockMovementType.SALE_RELEASE,
        StockMovementType.MAINTENANCE_RELEASE,
        StockMovementType.QUALITY_RELEASE,
    }

    if movement_type in outbound_physical_types:
        qty_in, qty_out = QUANTITY_ZERO, qty
    elif movement_type in release_soft_hold_types:
        qty_in, qty_out = QUANTITY_ZERO, qty
    else:
        qty_in, qty_out = qty, QUANTITY_ZERO

    entry = StockLedger(
        inventory_item=inventory_item,
        movement_type=movement_type,
        quantity_in=qty_in,
        quantity_out=qty_out,
        movement_date=movement_date or timezone.localdate(),
        stock_location=stock_location or inventory_item.default_stock_location,
        reference_model=reference_model or "MANUAL",
        reference_id=str(reference_id) if reference_id is not None else "0",
        posted_by=posted_by,
        notes=(notes or "").strip(),
    )
    entry.full_clean()
    entry.save()
    return entry


# ---------------------------------------------------------------------------
# Subscription / sale reservation
# ---------------------------------------------------------------------------

@transaction.atomic
def reserve_stock_for_subscription(
    *,
    inventory_item: InventoryItem,
    quantity: Decimal,
    subscription_id: int,
    posted_by=None,
    notes: str = "",
) -> StockLedger:
    """
    Soft-reserve stock when a subscription/order is confirmed.
    available_qty() decreases; physical stock is unchanged.

    Raises ValueError if available stock is insufficient.
    """
    qty = _quantity(quantity)
    if inventory_item.available_qty() < qty:
        raise ValueError(
            f"Insufficient available stock for {inventory_item.sku or inventory_item.pk}. "
            f"Available: {inventory_item.available_qty()}, Requested: {qty}."
        )
    return post_movement(
        inventory_item=inventory_item,
        movement_type=StockMovementType.SALE_RESERVE,
        quantity=qty,
        reference_model="Subscription",
        reference_id=subscription_id,
        posted_by=posted_by,
        notes=notes or f"Stock reserved for Subscription #{subscription_id}",
    )


@transaction.atomic
def release_stock_reservation(
    *,
    inventory_item: InventoryItem,
    quantity: Decimal,
    subscription_id: int,
    posted_by=None,
    notes: str = "",
) -> StockLedger:
    """
    Release a soft reservation on cancellation/expiry.
    reserved_qty() decreases; physical stock is unchanged.
    """
    qty = _quantity(quantity)
    return post_movement(
        inventory_item=inventory_item,
        movement_type=StockMovementType.SALE_RELEASE,
        quantity=qty,
        reference_model="Subscription",
        reference_id=subscription_id,
        posted_by=posted_by,
        notes=notes or f"Reservation released for Subscription #{subscription_id}",
    )


# ---------------------------------------------------------------------------
# Delivery out (physical movement + reservation release)
# ---------------------------------------------------------------------------

@transaction.atomic
def post_delivery_out(
    *,
    inventory_item: InventoryItem,
    quantity: Decimal,
    delivery_id: int,
    subscription_id: Optional[int] = None,
    posted_by=None,
    notes: str = "",
) -> list[StockLedger]:
    """
    Physical stock reduction on delivery completion.

    Creates:
    1. DELIVERY_OUT entry (reduces physical stock)
    2. SALE_RELEASE entry (releases any soft reservation for the subscription)

    Returns the two StockLedger rows created.
    """
    qty = _quantity(quantity)
    delivery_entry = post_movement(
        inventory_item=inventory_item,
        movement_type=StockMovementType.DELIVERY_OUT,
        quantity=qty,
        reference_model="SubscriptionDelivery",
        reference_id=delivery_id,
        posted_by=posted_by,
        notes=notes or f"Delivery #{delivery_id} – product dispatched",
    )

    entries = [delivery_entry]

    # Release the soft reservation if there is one for this subscription
    if subscription_id and inventory_item.reserved_qty() > QUANTITY_ZERO:
        release_qty = min(qty, inventory_item.reserved_qty())
        release_entry = post_movement(
            inventory_item=inventory_item,
            movement_type=StockMovementType.SALE_RELEASE,
            quantity=release_qty,
            reference_model="Subscription",
            reference_id=subscription_id,
            posted_by=posted_by,
            notes=f"Auto-release on delivery #{delivery_id}",
        )
        entries.append(release_entry)

    return entries


# ---------------------------------------------------------------------------
# Delivery blocking check
# ---------------------------------------------------------------------------

def check_stock_for_delivery(
    *,
    inventory_item: InventoryItem,
    quantity: Decimal = Decimal("1.000"),
) -> dict:
    """
    Check whether stock is available before scheduling a delivery.

    Returns:
        {"ok": True}   — enough stock (physical or reserved for this subscription)
        {"ok": False, "reason": "<human-readable>"}
    """
    qty = _quantity(quantity)
    physical = inventory_item.current_stock_quantity()
    reserved = inventory_item.reserved_qty()
    available = inventory_item.available_qty()

    if physical < qty:
        return {
            "ok": False,
            "reason": (
                f"Physical stock ({physical}) is less than required quantity ({qty})."
            ),
        }
    if available < qty and physical >= qty:
        return {
            "ok": False,
            "reason": (
                f"Physical stock ({physical}) exists but available-to-promise ({available}) "
                f"is insufficient due to {reserved} units already reserved."
            ),
        }
    return {"ok": True}
