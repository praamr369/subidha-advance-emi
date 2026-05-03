from __future__ import annotations

from decimal import Decimal
from typing import Any

from inventory.models import (
    InventoryItem,
    OpeningStockEntry,
    OpeningStockEntryStatus,
    PurchaseNeed,
    PurchaseNeedStatus,
    StockLedger,
)
from subscriptions.models import Product


QUANTITY_ZERO = Decimal("0.000")


def get_inventory_readiness_snapshot() -> dict[str, Any]:
    """
    Read-only operational readiness for inventory-backed selling/delivery flows.
    Never mutates domain tables.
    """
    warnings: list[dict[str, str]] = []
    recommended_actions: list[str] = []

    try:
        product_count = Product.objects.count()
        active_product_count = Product.objects.filter(is_active=True).count()
    except Exception:
        return {
            "module_not_configured": True,
            "inventory_ready": False,
            "warnings": [
                {"code": "MODULE_NOT_AVAILABLE", "message": "Product master is not available in this deployment."}
            ],
            "recommended_actions": ["Verify subscriptions app migrations and database connectivity."],
        }

    stock_item_count = InventoryItem.objects.count()
    active_stock_items = InventoryItem.objects.filter(is_active=True, stock_tracking_enabled=True)
    stock_item_count_active = active_stock_items.count()

    movements_count = StockLedger.objects.count()

    try:
        posted_opening = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.POSTED).count()
        draft_opening = OpeningStockEntry.objects.filter(status=OpeningStockEntryStatus.DRAFT).count()
    except Exception:
        posted_opening = 0
        draft_opening = 0

    products_without_stock: list[dict[str, Any]] = []
    low_stock_items: list[dict[str, Any]] = []

    for item in active_stock_items.select_related("product").iterator(chunk_size=500):
        pid = item.product_id
        pname = getattr(item.product, "name", "") or ""
        avail = item.available_qty()
        on_hand = item.current_stock_quantity()
        if avail <= QUANTITY_ZERO:
            products_without_stock.append({"product_id": pid, "product_name": pname, "inventory_item_id": item.id})
        threshold = item.reorder_level_qty or QUANTITY_ZERO
        if threshold > QUANTITY_ZERO and avail <= threshold:
            low_stock_items.append(
                {
                    "product_id": pid,
                    "product_name": pname,
                    "available": f"{avail:.3f}",
                    "reorder_level": f"{threshold:.3f}",
                }
            )

    stock_needs_open = PurchaseNeed.objects.filter(
        status__in=[
            PurchaseNeedStatus.OPEN,
            PurchaseNeedStatus.IN_REVIEW,
            PurchaseNeedStatus.ORDERED,
            PurchaseNeedStatus.PARTIALLY_FULFILLED,
        ]
    ).count()

    opening_stock_ready = posted_opening > 0 or movements_count > 0
    if stock_item_count_active and not opening_stock_ready:
        warnings.append(
            {
                "code": "OPENING_STOCK_NOT_POSTED",
                "message": "Tracked inventory items exist but no posted opening stock or ledger movements were found.",
            }
        )
        recommended_actions.append("Post opening stock or record initial ledger movements before relying on ATP quantities.")

    if active_product_count and stock_item_count_active == 0:
        warnings.append(
            {
                "code": "NO_ACTIVE_STOCK_ITEMS",
                "message": "Products exist but no active tracked inventory items — ATP checks will behave as unavailable.",
            }
        )
        recommended_actions.append("Create inventory profiles for sellable SKUs.")

    inventory_ready = stock_item_count_active > 0 and opening_stock_ready and len(products_without_stock) == 0

    if products_without_stock:
        warnings.append(
            {
                "code": "PRODUCTS_WITHOUT_STOCK",
                "message": f"{len(products_without_stock)} tracked SKU(s) report zero available quantity.",
            }
        )
        recommended_actions.append("Replenish stock or review demand planning / purchase needs.")

    if stock_needs_open:
        warnings.append(
            {"code": "OPEN_STOCK_NEEDS", "message": f"{stock_needs_open} purchase/stock need row(s) remain open."}
        )
        recommended_actions.append("Review Stock Needs workspace and close or fulfil outstanding requests.")

    return {
        "module_not_configured": False,
        "product_count": product_count,
        "active_product_count": active_product_count,
        "stock_item_count": stock_item_count,
        "active_tracked_stock_items": stock_item_count_active,
        "products_without_stock": products_without_stock[:200],
        "products_without_stock_count": len(products_without_stock),
        "low_stock_items": low_stock_items[:200],
        "low_stock_items_count": len(low_stock_items),
        "stock_needs_open": stock_needs_open,
        "stock_movements_count": movements_count,
        "opening_stock_posted_count": posted_opening,
        "opening_stock_draft_count": draft_opening,
        "opening_stock_ready": opening_stock_ready,
        "inventory_ready": inventory_ready,
        "warnings": warnings,
        "recommended_actions": recommended_actions,
    }
