"""
DemandService – Phase 2

Calculates demand vs supply and generates purchase suggestions.

Rules:
- Demand is read-only from existing operational records.
- No purchase orders are created automatically.
- Suggestions are presented to admins for manual action.
- Financial records (payments, EMI) are never touched here.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

QUANTITY_ZERO = Decimal("0.000")
MONEY_ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Demand calculation
# ---------------------------------------------------------------------------

def get_demand_for_product(product_id: int) -> dict:
    """
    Aggregate demand for a product from all active demand sources:
    1. SubscriptionRequests that are PENDING / PROCESSING (not yet confirmed)
    2. DirectSale pending orders (if direct-sale module exists)
    3. Rent / Lease requests in pending state

    Returns a dict with demand_quantity per source and total.
    """
    from django.db.models import Count

    demand: dict[str, int] = {}

    try:
        from subscriptions.models import SubscriptionRequest, SubscriptionRequestStatus
        sub_req_demand = SubscriptionRequest.objects.filter(
            product_id=product_id,
            status__in=[
                SubscriptionRequestStatus.PENDING,
                SubscriptionRequestStatus.PROCESSING,
            ],
        ).count()
        demand["subscription_requests"] = sub_req_demand
    except Exception:
        demand["subscription_requests"] = 0

    # Direct-sale pending orders (billing module)
    try:
        from billing.models import DirectSale
        ds_statuses = getattr(
            DirectSale,
            "PENDING_STATUSES",
            None,
        )
        if ds_statuses is None:
            # Fallback: use status field if it exists
            ds_demand = DirectSale.objects.filter(
                product_id=product_id,
                status__in=["PENDING", "INVOICED"],
            ).count()
        else:
            ds_demand = DirectSale.objects.filter(
                product_id=product_id,
                status__in=ds_statuses,
            ).count()
        demand["direct_sale_pending"] = ds_demand
    except Exception:
        demand["direct_sale_pending"] = 0

    total = sum(demand.values())
    return {
        "product_id": product_id,
        "demand_by_source": demand,
        "total_demand_quantity": total,
    }


def get_shortage_for_product(product_id: int) -> dict:
    """
    Calculates shortage = total_demand - available_qty.
    Returns shortage (0 if no shortage), physical stock, reserved, available, and demand.
    """
    from subscriptions.models import Product

    try:
        product = Product.objects.select_related("inventory_profile").get(pk=product_id)
        inv_item = product.inventory_profile
        physical = inv_item.current_stock_quantity()
        reserved = inv_item.reserved_qty()
        available = inv_item.available_qty()
    except Exception:
        physical = QUANTITY_ZERO
        reserved = QUANTITY_ZERO
        available = QUANTITY_ZERO

    demand_data = get_demand_for_product(product_id)
    total_demand = Decimal(str(demand_data["total_demand_quantity"]))
    shortage = max(QUANTITY_ZERO, total_demand - available)

    return {
        "product_id": product_id,
        "physical_stock": physical,
        "reserved_stock": reserved,
        "available_stock": available,
        "total_demand": total_demand,
        "shortage": shortage,
        "has_shortage": shortage > QUANTITY_ZERO,
        "demand_detail": demand_data["demand_by_source"],
    }


# ---------------------------------------------------------------------------
# Purchase suggestion engine
# ---------------------------------------------------------------------------

def get_purchase_suggestions(*, product_ids: Optional[list[int]] = None) -> list[dict]:
    """
    Returns purchase suggestions for products that are below their low_stock_threshold
    or have an active demand shortage.

    Suggestions are advisory only — no PO is created automatically.
    Admin must review and act.

    Args:
        product_ids: Limit to specific products. If None, scans all active tracked items.

    Returns a list of suggestion dicts, each containing:
        - product_id, product_code, product_name
        - physical_stock, reserved_stock, available_stock
        - low_stock_threshold (= reorder_level_qty)
        - total_demand, shortage
        - suggested_order_quantity
        - trigger: "LOW_STOCK" | "SHORTAGE" | "BOTH"
        - preferred_vendor_name (if available from last purchase bill)
    """
    from inventory.models import InventoryItem

    qs = InventoryItem.objects.select_related("product").filter(
        is_active=True,
        stock_tracking_enabled=True,
    )
    if product_ids:
        qs = qs.filter(product_id__in=product_ids)

    suggestions = []

    for item in qs:
        physical = item.current_stock_quantity()
        reserved = item.reserved_qty()
        available = item.available_qty()
        threshold = item.reorder_level_qty or QUANTITY_ZERO

        shortage_data = get_shortage_for_product(item.product_id)
        shortage = shortage_data["shortage"]
        total_demand = shortage_data["total_demand"]

        below_threshold = threshold > QUANTITY_ZERO and physical <= threshold
        has_shortage = shortage > QUANTITY_ZERO

        if not below_threshold and not has_shortage:
            continue

        trigger = "BOTH" if below_threshold and has_shortage else (
            "LOW_STOCK" if below_threshold else "SHORTAGE"
        )

        # Suggested quantity: fill up to threshold + cover demand shortfall
        suggested_qty = max(
            threshold - physical if below_threshold else QUANTITY_ZERO,
            shortage,
        )
        suggested_qty = max(suggested_qty, Decimal("1.000"))

        # Preferred vendor: last purchase bill vendor for this item
        preferred_vendor_name = ""
        try:
            from inventory.models import PurchaseBillLine
            last_line = (
                PurchaseBillLine.objects.filter(inventory_item=item)
                .select_related("purchase_bill__vendor")
                .order_by("-purchase_bill__bill_date", "-id")
                .first()
            )
            if last_line and last_line.purchase_bill.vendor:
                preferred_vendor_name = (
                    last_line.purchase_bill.vendor.name or ""
                )
        except Exception:
            preferred_vendor_name = ""

        suggestions.append({
            "product_id": item.product_id,
            "product_code": item.product.product_code,
            "product_name": item.product.name,
            "sku": item.sku or "",
            "physical_stock": physical,
            "reserved_stock": reserved,
            "available_stock": available,
            "low_stock_threshold": threshold,
            "total_demand": total_demand,
            "shortage": shortage,
            "suggested_order_quantity": suggested_qty,
            "trigger": trigger,
            "preferred_vendor_name": preferred_vendor_name,
        })

    # Sort by urgency: BOTH > SHORTAGE > LOW_STOCK, then by shortage desc
    trigger_order = {"BOTH": 0, "SHORTAGE": 1, "LOW_STOCK": 2}
    suggestions.sort(
        key=lambda s: (trigger_order.get(s["trigger"], 9), -float(s["shortage"]))
    )
    return suggestions
