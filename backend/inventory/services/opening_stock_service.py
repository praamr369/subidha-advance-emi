"""Opening stock entry service with database-level KPI aggregation and pagination."""

from __future__ import annotations

from django.db.models import Q, Count

from inventory.models import OpeningStockEntry


def build_opening_stock_entries(
    *,
    status: str | None = None,
    search: str | None = None,
    stock_location_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
):
    """Build paginated opening stock entries with KPI counts at database level.

    Args:
        status: Filter by DRAFT or POSTED (optional)
        search: Search by SKU, product code, or product name (optional)
        stock_location_id: Filter by warehouse location (optional)
        page: Current page (default 1)
        page_size: Items per page (default 50, max 500)

    Returns:
        {
            "count": total_entries,
            "page": current_page,
            "page_size": items_per_page,
            "num_pages": total_pages,
            "draft_count": total_draft_entries,
            "posted_count": total_posted_entries,
            "results": [paginated_entries]
        }
    """
    queryset = OpeningStockEntry.objects.select_related(
        "inventory_item",
        "inventory_item__product",
        "stock_location",
        "batch",
        "created_by",
        "posted_by",
        "correction_adjustment",
    ).all()

    # Apply filters
    if status:
        status = status.strip().upper()
        queryset = queryset.filter(status=status)

    if search:
        search = search.strip()
        queryset = queryset.filter(
            Q(inventory_item__sku__icontains=search)
            | Q(inventory_item__product__product_code__icontains=search)
            | Q(inventory_item__product__name__icontains=search)
        )

    if stock_location_id:
        try:
            stock_location_id = int(stock_location_id)
            queryset = queryset.filter(stock_location_id=stock_location_id)
        except (ValueError, TypeError):
            pass

    # Order by date descending
    queryset = queryset.order_by("-effective_date", "-id")

    # Calculate KPI counts at database level (entire dataset, not just current page)
    all_entries = OpeningStockEntry.objects.all()
    kpi_counts = all_entries.values("status").annotate(count=Count("id"))
    kpi_map = {item["status"]: item["count"] for item in kpi_counts}

    # Get total count for pagination
    total_count = queryset.count()

    # Apply pagination
    page = max(1, page)
    page_size = min(page_size, 500)  # Cap at 500
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset[start_idx:end_idx]

    num_pages = (total_count + page_size - 1) // page_size

    # Serialize results
    results = []
    for row in paginated_queryset:
        result = {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "inventory_item_sku": getattr(row.inventory_item, "sku", None),
            "product_code": getattr(row.inventory_item.product, "product_code", None),
            "product_name": getattr(row.inventory_item.product, "name", None),
            "stock_location_id": row.stock_location_id,
            "stock_location_name": getattr(row.stock_location, "name", None),
            "effective_date": row.effective_date.isoformat() if row.effective_date else None,
            "opening_qty": f"{row.quantity:.3f}" if row.quantity else "0.000",
            "unit_cost_snapshot": f"{row.unit_cost_snapshot:.2f}" if row.unit_cost_snapshot else None,
            "status": row.status,
            "batch_key": getattr(row.batch, "batch_key", None),
            "created_by_username": getattr(row.created_by, "username", None),
            "posted_by_username": getattr(row.posted_by, "username", None),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "posted_at": row.posted_at.isoformat() if row.posted_at else None,
        }
        results.append(result)

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "draft_count": kpi_map.get("DRAFT", 0),
        "posted_count": kpi_map.get("POSTED", 0),
        "results": results,
    }
