"""Stock location service with database-level KPI aggregation and pagination."""

from __future__ import annotations

from django.db.models import Q, Count

from inventory.models import StockLocation


def build_stock_locations(
    *,
    is_active: bool | None = None,
    location_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    """Build paginated stock locations with KPI counts at database level.

    Args:
        is_active: Filter by active status (optional)
        location_type: Filter by STORE, WAREHOUSE, or SHOWROOM (optional)
        search: Search by code or name (optional)
        page: Current page (default 1)
        page_size: Items per page (default 50, max 500)

    Returns:
        {
            "count": total_locations,
            "page": current_page,
            "page_size": items_per_page,
            "num_pages": total_pages,
            "active_count": total_active_locations,
            "warehouse_count": total_warehouse_locations,
            "showroom_count": total_showroom_locations,
            "store_count": total_store_locations,
            "results": [paginated_locations]
        }
    """
    queryset = StockLocation.objects.all()

    # Apply filters
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)

    if location_type:
        location_type = location_type.strip().upper()
        queryset = queryset.filter(location_type=location_type)

    if search:
        search = search.strip()
        queryset = queryset.filter(
            Q(code__icontains=search) | Q(name__icontains=search)
        )

    # Order by name
    queryset = queryset.order_by("name", "id")

    # Calculate KPI counts at database level (entire dataset, not just current page)
    all_locations = StockLocation.objects.all()
    active_count = all_locations.filter(is_active=True).count()
    warehouse_count = all_locations.filter(location_type="WAREHOUSE").count()
    showroom_count = all_locations.filter(location_type="SHOWROOM").count()
    store_count = all_locations.filter(location_type="STORE").count()

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
            "code": row.code,
            "name": row.name,
            "location_type": row.location_type,
            "is_active": row.is_active,
            "notes": row.notes,
            "address": row.address,
            "phone": row.phone,
            "is_default_receiving_location": row.is_default_receiving_location,
            "branch_id": row.branch_id,
            "branch_name": getattr(row.branch, "name", None),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        results.append(result)

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "active_count": active_count,
        "warehouse_count": warehouse_count,
        "showroom_count": showroom_count,
        "store_count": store_count,
        "results": results,
    }
