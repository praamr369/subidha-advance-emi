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
        StockMovementType.RENT_HANDOVER_OUT,
        StockMovementType.LEASE_HANDOVER_OUT,
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

    # Sync linked ProductVariant quantity if present
    try:
        core_prod = inventory_item.product
        if core_prod and hasattr(core_prod, "pim_variant") and core_prod.pim_variant:
            from products_pim.models import ProductVariant
            new_qty = int(inventory_item.current_stock_quantity())
            ProductVariant.objects.filter(pk=core_prod.pim_variant.pk).update(quantity_on_hand=new_qty)
    except Exception:
        pass

    if movement_type in {
        StockMovementType.DAMAGE,
        StockMovementType.STOCK_ADJUSTMENT,
        StockMovementType.ADJUSTMENT_OUT,
    }:
        try:
            from subscriptions.services.operational_notification_service import (
                schedule_stock_adjustment_notification,
            )

            prod_name = (
                inventory_item.product.name
                if inventory_item.product
                else inventory_item.sku
            )
            loc_name = (
                entry.stock_location.name
                if entry.stock_location
                else "Default location"
            )
            schedule_stock_adjustment_notification(
                ledger_id=entry.id,
                product_name=prod_name,
                movement_type=movement_type,
                quantity_str=str(qty),
                location_name=loc_name,
                notes=entry.notes,
            )
        except Exception:
            pass

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
    variant_sku: str | None = None,
) -> dict:
    """
    Check whether stock is available before scheduling a delivery, including
    all attached/bundled accessories and raw materials (e.g. Commercial Plyboard for a Bed).

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

    # Check attached bundled products / accessories (e.g. Commercial Plyboard for a Bed)
    checked_acc_ids = set()

    # 1. ProductRelationship (PIM catalog)
    product = getattr(inventory_item, "product", None)
    v_sku = variant_sku or getattr(inventory_item, "sku", None) or getattr(product, "sku", None)
    
    from products_core.models import ProductRelationship
    from django.db.models import Q as _Q

    rel_filter = _Q()
    if product:
        rel_filter |= _Q(product=product)
        try:
            from products_pim.models import ProductVariant
            pv = ProductVariant.objects.filter(operational_product_id=product.id).select_related("product").first()
            if pv and pv.product and pv.product.source_product_id:
                rel_filter |= _Q(product_id=pv.product.source_product_id)
        except Exception:
            pass

    if v_sku:
        rel_filter |= _Q(parent_variant_sku=v_sku)

    candidate_rels = []
    if rel_filter:
        candidate_rels = list(
            ProductRelationship.objects.filter(rel_filter)
            .select_related("related_product", "related_product__inventory_profile")
            .distinct()
        )

    for rel in candidate_rels:
        if rel.parent_variant_sku and v_sku and rel.parent_variant_sku != v_sku:
            continue
        if rel.parent_variant_sku and not v_sku:
            continue

        rel_inv = None
        if rel.related_variant_sku:
            rel_inv = InventoryItem.objects.filter(sku=rel.related_variant_sku).first()
        if not rel_inv and rel.related_product:
            rel_inv = getattr(rel.related_product, "inventory_profile", None)
        if not rel_inv and rel.related_product_id:
            rel_inv = InventoryItem.objects.filter(product_id=rel.related_product_id).first()

        if not rel_inv or not rel_inv.stock_tracking_enabled:
            continue
        checked_acc_ids.add(rel_inv.id)
        rel_req = qty * Decimal(str(rel.quantity or 1))
        rel_phys = rel_inv.current_stock_quantity()
        rel_avail = rel_inv.available_qty()
        if rel_phys < rel_req:
            return {
                "ok": False,
                "reason": (
                    f"Required bundled {rel.relationship_type.title()} '{rel.related_product.name}' "
                    f"({rel.related_product.product_code}) is out of stock. Available: {rel_phys:.2f}, Required: {rel_req:.2f}."
                ),
                "bundled_item_id": rel.related_product_id,
            }
        if rel_avail < rel_req and rel_phys >= rel_req:
            return {
                "ok": False,
                "reason": (
                    f"Required bundled {rel.relationship_type.title()} '{rel.related_product.name}' "
                    f"has insufficient available stock ({rel_avail:.2f}) for required {rel_req:.2f} due to reservations."
                ),
                "bundled_item_id": rel.related_product_id,
            }

    # 2. FinishedGoodAccessoryLink (Inventory FG profile)
    if hasattr(inventory_item, "accessory_links"):
        for link in inventory_item.accessory_links.filter(is_default_included=True).select_related("accessory", "accessory__product"):
            acc_inv = link.accessory
            if not acc_inv or not acc_inv.stock_tracking_enabled or acc_inv.id in checked_acc_ids:
                continue
            checked_acc_ids.add(acc_inv.id)
            pim_rel = None
            if acc_inv.product_id:
                from products_core.models import ProductRelationship
                if v_sku:
                    pim_rel = ProductRelationship.objects.filter(
                        related_product_id=acc_inv.product_id,
                        parent_variant_sku=v_sku,
                    ).first()
                if not pim_rel and inventory_item.product and hasattr(inventory_item.product, "related_products"):
                    pim_rel = inventory_item.product.related_products.filter(
                        related_product=acc_inv.product
                    ).first()
            acc_ratio = Decimal(str(pim_rel.quantity)) if pim_rel and pim_rel.quantity else Decimal(str(getattr(link, "quantity", None) or 1))
            acc_req = qty * acc_ratio
            acc_phys = acc_inv.current_stock_quantity()
            acc_avail = acc_inv.available_qty()
            acc_name = acc_inv.product.name if acc_inv.product else (acc_inv.sku or "Accessory")
            if acc_phys < acc_req:
                return {
                    "ok": False,
                    "reason": (
                        f"Required linked accessory '{acc_name}' "
                        f"({acc_inv.sku or acc_inv.pk}) is out of stock. Available: {acc_phys:.2f}, Required: {acc_req:.2f}."
                    ),
                    "bundled_item_id": acc_inv.id,
                }
            if acc_avail < acc_req and acc_phys >= acc_req:
                return {
                    "ok": False,
                    "reason": (
                        f"Required linked accessory '{acc_name}' "
                        f"has insufficient available stock ({acc_avail:.2f}) for required {acc_req:.2f} due to reservations."
                    ),
                    "bundled_item_id": acc_inv.id,
                }

    return {"ok": True}
