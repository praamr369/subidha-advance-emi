from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from inventory.models import (
    HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN,
    RETURN_IN_MOVEMENT_TYPE_BY_PLAN,
    StockLedger,
    StockMovementType,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog, DeliveryStatus


def _sync_accessory_stock_entry(
    *,
    delivery,
    product,
    acc_inv,
    bundled_qty: Decimal,
    movement_type: str,
    is_inflow: bool,
    is_outflow: bool,
    delivery_ref: str,
    link_type_label: str,
    acc_name: str,
    primary_ref_id: str,
    inventory_item,
    performed_by,
) -> int:
    """
    Safely creates or adjusts stock ledger entries for a bundled/linked accessory.
    Honor append-only invariant: if an entry already exists with a different quantity,
    post an ADJUSTMENT_IN or additional movement rather than destructively mutating.
    """
    target_q_in = bundled_qty if is_inflow else Decimal("0.000")
    target_q_out = bundled_qty if is_outflow else Decimal("0.000")

    # Look for existing entries for this delivery line & accessory item
    existing_entries = list(
        StockLedger.objects.filter(
            inventory_item=acc_inv,
            reference_model="SubscriptionDelivery",
            reference_id__startswith=f"{delivery.id}-{product.id}:",
        )
    )

    if not existing_entries:
        bundled_notes = f"{delivery_ref} ({link_type_label}: {acc_name})".strip()
        _, created = create_stock_ledger_entry(
            inventory_item=acc_inv,
            movement_type=movement_type,
            movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
            stock_location=acc_inv.default_stock_location or inventory_item.default_stock_location,
            quantity_in=target_q_in,
            quantity_out=target_q_out,
            reference_model="SubscriptionDelivery",
            reference_id=primary_ref_id,
            notes=bundled_notes,
            posted_by=performed_by,
        )
        return 1 if created else 0

    # If entries already exist, compute net posted vs target
    net_posted_out = sum((Decimal(str(e.quantity_out)) for e in existing_entries), Decimal("0.000"))
    net_posted_in = sum((Decimal(str(e.quantity_in)) for e in existing_entries), Decimal("0.000"))
    net_posted = net_posted_out - net_posted_in if is_outflow else net_posted_in - net_posted_out
    target_net = bundled_qty

    diff = net_posted - target_net
    if diff > Decimal("0.000"):
        # Over-deducted in the past: post an append-only ADJUSTMENT_IN to restore difference
        corr_ref_id = f"{delivery.id}-{product.id}:adj_corr:{acc_inv.id}"
        if not StockLedger.objects.filter(reference_model="SubscriptionDelivery", reference_id=corr_ref_id).exists():
            corr_notes = f"{delivery_ref} (Stock Adjustment: corrected {acc_name} to {bundled_qty} from {net_posted})"
            create_stock_ledger_entry(
                inventory_item=acc_inv,
                movement_type=StockMovementType.ADJUSTMENT_IN,
                movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
                stock_location=acc_inv.default_stock_location or inventory_item.default_stock_location,
                quantity_in=diff,
                quantity_out=Decimal("0.000"),
                reference_model="SubscriptionDelivery",
                reference_id=corr_ref_id,
                notes=corr_notes,
                posted_by=performed_by,
            )
            return 1
    elif diff < Decimal("0.000"):
        # Under-deducted in the past: post additional movement
        add_ref_id = f"{delivery.id}-{product.id}:adj_add:{acc_inv.id}"
        if not StockLedger.objects.filter(reference_model="SubscriptionDelivery", reference_id=add_ref_id).exists():
            add_notes = f"{delivery_ref} (Stock Adjustment: additional {acc_name} {abs(diff)})"
            create_stock_ledger_entry(
                inventory_item=acc_inv,
                movement_type=movement_type,
                movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
                stock_location=acc_inv.default_stock_location or inventory_item.default_stock_location,
                quantity_in=abs(diff) if is_inflow else Decimal("0.000"),
                quantity_out=abs(diff) if is_outflow else Decimal("0.000"),
                reference_model="SubscriptionDelivery",
                reference_id=add_ref_id,
                notes=add_notes,
                posted_by=performed_by,
            )
            return 1

    return 0


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
    skipped_reasons: list[str] = []

    for product, qty in items_to_move:
        inventory_item = getattr(product, "inventory_profile", None)
        if inventory_item is None or not inventory_item.stock_tracking_enabled:
            skipped_reasons.append("inventory_not_tracked")
            continue
        if not inventory_item.delivery_stock_bridge_enabled:
            skipped_reasons.append("delivery_bridge_disabled")
            continue

        q_in = qty if is_inflow else Decimal("0.000")
        q_out = qty if is_outflow else Decimal("0.000")

        ref_id = f"{delivery.id}-{product.id}" if len(items_to_move) > 1 else str(delivery.id)

        batch_num = getattr(delivery, "batch_number", None)
        delivery_ref = getattr(delivery, "delivery_reference", "") or ""
        batch_suffix = f" (Batch #{batch_num})" if batch_num is not None else ""
        parent_notes = f"{delivery_ref}{batch_suffix}".strip()

        entry, created = create_stock_ledger_entry(
            inventory_item=inventory_item,
            movement_type=movement_type,
            movement_date=(delivery.delivered_at or delivery.returned_at or delivery.updated_at).date(),
            stock_location=inventory_item.default_stock_location,
            quantity_in=q_in,
            quantity_out=q_out,
            reference_model="SubscriptionDelivery",
            reference_id=ref_id,
            notes=parent_notes,
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

        # Also maintain bundled / attached accessories & raw materials (e.g. Commercial Plyboard for a Bed)
        processed_acc_ids = set()

        # Build candidate variant SKUs for this specific line item product
        item_variant_skus = set()
        if inventory_item and inventory_item.sku:
            item_variant_skus.add(inventory_item.sku)
        if getattr(inventory_item, "variant", None) and inventory_item.variant.sku:
            item_variant_skus.add(inventory_item.variant.sku)
        if getattr(subscription, "product_id", None) == product.id and getattr(subscription, "product_variant_sku", None):
            item_variant_skus.add(subscription.product_variant_sku)
        if getattr(delivery, "variant_sku", None):
            item_variant_skus.add(delivery.variant_sku)

        # 1. Bundled Products / Accessories from ProductRelationship (PIM catalog)
        candidate_rels = []
        if hasattr(product, "related_products") and product.related_products.exists():
            candidate_rels = list(product.related_products.select_related("related_product", "related_product__inventory_profile").all())
        elif item_variant_skus:
            from products_core.models import ProductRelationship
            candidate_rels = list(ProductRelationship.objects.filter(parent_variant_sku__in=item_variant_skus).select_related("related_product", "related_product__inventory_profile").all())
            if not candidate_rels:
                try:
                    from products_pim.models import ProductVariant
                    pv = ProductVariant.objects.filter(operational_product_id=product.id).first()
                    if pv and pv.product_id:
                        from products_core.models import Product as CoreProduct
                        base_p = CoreProduct.objects.filter(id=pv.product_id).first()
                        if base_p and hasattr(base_p, "related_products"):
                            candidate_rels = list(base_p.related_products.select_related("related_product", "related_product__inventory_profile").all())
                except Exception:
                    pass

        for rel in candidate_rels:
            if rel.parent_variant_sku and item_variant_skus and rel.parent_variant_sku not in item_variant_skus:
                continue
            rel_inv = getattr(rel.related_product, "inventory_profile", None)
            if rel_inv is None or not rel_inv.stock_tracking_enabled:
                continue
            processed_acc_ids.add(rel_inv.id)
            bundled_qty = qty * Decimal(str(rel.quantity or 1))
            rel_ref_id = f"{delivery.id}-{product.id}:bundled:{rel.id}"
            acc_name = rel.related_product.name
            link_label = f"Bundled {rel.relationship_type.title()}"
            entries_created += _sync_accessory_stock_entry(
                delivery=delivery,
                product=product,
                acc_inv=rel_inv,
                bundled_qty=bundled_qty,
                movement_type=movement_type,
                is_inflow=is_inflow,
                is_outflow=is_outflow,
                delivery_ref=delivery_ref,
                link_type_label=link_label,
                acc_name=acc_name,
                primary_ref_id=rel_ref_id,
                inventory_item=inventory_item,
                performed_by=performed_by,
            )

        # 2. Linked Accessories from FinishedGoodAccessoryLink (Inventory FG profile)
        if inventory_item and hasattr(inventory_item, "accessory_links"):
            for link in inventory_item.accessory_links.filter(
                is_default_included=True
            ).select_related("accessory", "accessory__product", "accessory__default_stock_location").all():
                acc_inv = link.accessory
                if acc_inv is None or not acc_inv.stock_tracking_enabled or acc_inv.id in processed_acc_ids:
                    continue
                processed_acc_ids.add(acc_inv.id)

                # Authoritative quantity from PIM relationship if present, else link quantity
                pim_rel = None
                if acc_inv.product_id:
                    from products_core.models import ProductRelationship
                    if inventory_item and inventory_item.sku:
                        pim_rel = ProductRelationship.objects.filter(
                            related_product_id=acc_inv.product_id,
                            parent_variant_sku=inventory_item.sku,
                        ).first()
                    if not pim_rel and hasattr(product, "related_products"):
                        pim_rel = product.related_products.filter(
                            related_product=acc_inv.product
                        ).first()
                acc_ratio = Decimal(str(pim_rel.quantity)) if pim_rel and pim_rel.quantity else Decimal(str(getattr(link, "quantity", None) or 1))
                bundled_qty = qty * acc_ratio
                rel_ref_id = f"{delivery.id}-{product.id}:fg_acc:{link.id}"
                acc_name = acc_inv.product.name if acc_inv.product else (acc_inv.sku or "Accessory")
                entries_created += _sync_accessory_stock_entry(
                    delivery=delivery,
                    product=product,
                    acc_inv=acc_inv,
                    bundled_qty=bundled_qty,
                    movement_type=movement_type,
                    is_inflow=is_inflow,
                    is_outflow=is_outflow,
                    delivery_ref=delivery_ref,
                    link_type_label="Linked Accessory",
                    acc_name=acc_name,
                    primary_ref_id=rel_ref_id,
                    inventory_item=inventory_item,
                    performed_by=performed_by,
                )

    if entries_created == 0 and skipped_reasons:
        return {
            "created": False,
            "entries_created": 0,
            "skipped": True,
            "reason": skipped_reasons[0],
            "stock_ledger_id": None,
            "movement_type": movement_type,
        }

    return {
        "created": entries_created > 0,
        "entries_created": entries_created,
        "stock_ledger_id": last_entry_id,
        "movement_type": movement_type,
    }
