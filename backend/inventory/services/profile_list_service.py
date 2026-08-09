"""
Inventory Profiles List Service

Server-side filtering, pagination, and KPI aggregation for the Inventory Profiles workbench.
"""

from __future__ import annotations

from django.db.models import Q, Count

from inventory.models import InventoryItem


def build_inventory_profiles_list(
    search: str | None = None,
    stock_tracking_enabled: bool | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Build paginated inventory profiles list with server-side filtering and KPI aggregation.

    Args:
        search: Search by product name, SKU, or product code
        stock_tracking_enabled: Filter by tracking status (True/False)
        page: Page number (1-indexed)
        page_size: Items per page (max 500)

    Returns:
        {
            "count": total_filtered_count,
            "page": current_page,
            "page_size": page_size,
            "num_pages": total_pages,
            "summary": {
                "total_profiles": int,
                "tracking_active": int,
                "tracking_inactive": int,
                "with_sku": int,
                "without_sku": int,
                "with_default_location": int,
                "without_default_location": int,
            },
            "results": [profile_row, ...]
        }
    """
    # Start with all inventory items
    queryset = InventoryItem.objects.select_related("product", "default_stock_location").all()

    # Apply search filter
    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) |
            Q(sku__icontains=search) |
            Q(product__product_code__icontains=search)
        )

    # Apply stock tracking filter
    if stock_tracking_enabled is not None:
        queryset = queryset.filter(stock_tracking_enabled=stock_tracking_enabled)

    # Get total count BEFORE pagination
    filtered_count = queryset.count()

    # Calculate KPI summary (from ENTIRE filtered dataset)
    all_items = InventoryItem.objects.all()
    summary = {
        "total_profiles": all_items.count(),
        "tracking_active": all_items.filter(stock_tracking_enabled=True).count(),
        "tracking_inactive": all_items.filter(stock_tracking_enabled=False).count(),
        "with_sku": all_items.exclude(sku__isnull=True).exclude(sku="").count(),
        "without_sku": all_items.filter(Q(sku__isnull=True) | Q(sku="")).count(),
        "with_default_location": all_items.exclude(default_stock_location__isnull=True).count(),
        "without_default_location": all_items.filter(default_stock_location__isnull=True).count(),
    }

    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset.order_by("product__name", "id")[start_idx:end_idx]

    # Calculate pagination info
    num_pages = (filtered_count + page_size - 1) // page_size if filtered_count > 0 else 1

    # Build result rows
    results = []
    for item in paginated_queryset:
        result = {
            "id": item.id,
            "product_id": item.product_id,
            "product_name": item.product.name,
            "product_code": item.product.product_code,
            "sku": item.sku or "",
            "stock_tracking_enabled": item.stock_tracking_enabled,
            "stock_item_type": item.stock_item_type,
            "unit_of_measure": item.unit_of_measure,
            "default_location_name": item.default_stock_location.name if item.default_stock_location else None,
            "reorder_level_qty": f"{item.reorder_level_qty:.3f}" if item.reorder_level_qty else "0.000",
            "valuation_method": item.valuation_method,
            "is_active": item.is_active,
        }
        results.append(result)

    return {
        "count": filtered_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "summary": summary,
        "results": results,
    }


def bulk_prepare_profiles(
    item_ids: list[int],
    default_location_id: int | None = None,
    reorder_level_qty: str = "0.000",
    stock_item_type: str = "FINISHED_GOOD",
) -> dict:
    """
    Bulk prepare inventory profiles with standard tracking rules.

    Args:
        item_ids: List of InventoryItem IDs to prepare
        default_location_id: Default stock location to assign
        reorder_level_qty: Reorder level quantity
        stock_item_type: Type of stock item (FINISHED_GOOD, ACCESSORY, RAW_MATERIAL)

    Returns:
        {
            "success": bool,
            "updated_count": int,
            "results": [{"id": int, "success": bool, "error": str | None}, ...]
        }
    """
    results = []
    updated_count = 0

    for item_id in item_ids:
        try:
            item = InventoryItem.objects.get(pk=item_id)

            # Update fields
            if default_location_id:
                item.default_stock_location_id = default_location_id
            item.reorder_level_qty = reorder_level_qty
            item.stock_item_type = stock_item_type
            item.stock_tracking_enabled = True

            item.save()
            results.append({"id": item_id, "success": True, "error": None})
            updated_count += 1
        except InventoryItem.DoesNotExist:
            results.append({"id": item_id, "success": False, "error": "Item not found"})
        except Exception as e:
            results.append({"id": item_id, "success": False, "error": str(e)})

    return {
        "success": updated_count == len(item_ids),
        "updated_count": updated_count,
        "results": results,
    }
