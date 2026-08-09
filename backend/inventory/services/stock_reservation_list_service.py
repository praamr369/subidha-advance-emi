"""
Stock Reservation List Service

Server-side filtering, pagination, and KPI aggregation for the Stock Reservations workbench.
"""

from __future__ import annotations

from django.db.models import Count, Q, Sum

from inventory.models import StockReservation, StockReservationStatus


def build_stock_reservations_list(
    search: str | None = None,
    status: str | None = None,
    source_module: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Build paginated stock reservations list with server-side filtering and KPI aggregation.

    Args:
        search: Search by product name or SKU
        status: Filter by status (ACTIVE, RELEASED)
        source_module: Filter by source module (SUBSCRIPTION, DELIVERY, DIRECT_SALE, etc.)
        page: Page number (1-indexed)
        page_size: Items per page (max 500)

    Returns:
        {
            "count": total_filtered_count,
            "page": current_page,
            "page_size": page_size,
            "num_pages": total_pages,
            "summary": {
                "total_reservations": int,
                "total_reserved_qty": str,
                "active_count": int,
                "released_count": int,
                "source_modules": [list of unique source modules],
            },
            "results": [reservation_row, ...]
        }
    """
    # Start with all reservations
    queryset = (
        StockReservation.objects
        .select_related("product", "warehouse")
        .all()
    )

    # Apply search filter (by product name or warehouse name)
    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search)
            | Q(product__product_code__icontains=search)
            | Q(warehouse__name__icontains=search)
        )

    # Apply status filter
    if status:
        queryset = queryset.filter(status=status)

    # Apply source module filter
    if source_module:
        queryset = queryset.filter(source_module=source_module)

    # Get total count BEFORE pagination
    filtered_count = queryset.count()

    # Calculate KPI summary (from ENTIRE dataset, not just filtered page)
    all_reservations = StockReservation.objects.all()
    summary_stats = all_reservations.aggregate(
        active_count=Count("id", filter=Q(status=StockReservationStatus.ACTIVE)),
        released_count=Count("id", filter=Q(status=StockReservationStatus.RELEASED)),
        total_reserved_qty=Sum("quantity"),
    )

    # Get unique source modules
    source_modules = list(
        StockReservation.objects
        .filter(source_module__gt="")
        .values_list("source_module", flat=True)
        .distinct()
        .order_by("source_module")
    )

    summary = {
        "total_reservations": all_reservations.count(),
        "total_reserved_qty": str(summary_stats.get("total_reserved_qty") or "0.000"),
        "active_count": summary_stats.get("active_count") or 0,
        "released_count": summary_stats.get("released_count") or 0,
        "source_modules": source_modules,
    }

    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset.order_by("-created_at", "-id")[start_idx:end_idx]

    # Calculate pagination info
    num_pages = (filtered_count + page_size - 1) // page_size if filtered_count > 0 else 1

    # Build result rows
    results = []
    for reservation in paginated_queryset:
        result = {
            "id": reservation.id,
            "product_id": reservation.product.id,
            "product_code": reservation.product.product_code,
            "product_name": reservation.product.name,
            "warehouse_id": reservation.warehouse.id,
            "warehouse_code": reservation.warehouse.code or "—",
            "warehouse_name": reservation.warehouse.name,
            "quantity": str(reservation.quantity),
            "status": reservation.status,
            "source_module": reservation.source_module,
            "source_object_id": reservation.source_object_id,
            "created_by_username": reservation.created_by.username if reservation.created_by else "—",
            "released_at": reservation.released_at.isoformat() if reservation.released_at else None,
            "note": reservation.note or "",
            "created_at": reservation.created_at.isoformat() if reservation.created_at else None,
            "updated_at": reservation.updated_at.isoformat() if reservation.updated_at else None,
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
