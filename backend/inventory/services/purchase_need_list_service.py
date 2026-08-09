"""
Purchase Needs List Service

Server-side filtering, pagination, and KPI aggregation for the Purchase Needs workbench.
Provides accurate counts directly from the database, not from browser-side row filtering.
"""

from __future__ import annotations

from django.db.models import Q, Count

from inventory.models import PurchaseNeed


def build_purchase_needs_list(
    status: str | None = None,
    source_module: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Build paginated purchase needs list with server-side filtering and KPI aggregation.

    Args:
        status: Filter by status (OPEN, ORDER_PLACED, DISMISSED, RESOLVED)
        source_module: Filter by source (DIRECT_SALE, WINNER_DELIVERY, SUBSCRIPTION_DEMAND, GENERAL)
        search: Search by customer name or product name
        page: Page number (1-indexed)
        page_size: Items per page (max 500)

    Returns:
        {
            "count": total_filtered_count,
            "page": current_page,
            "page_size": page_size,
            "num_pages": total_pages,
            "summary": {
                "total_open": int,
                "total_all": int,
                "by_source": {
                    "DIRECT_SALE": int,
                    "WINNER_DELIVERY": int,
                    "SUBSCRIPTION_DEMAND": int,
                    "GENERAL": int,
                }
            },
            "results": [purchase_need_row, ...]
        }
    """
    # Start with all purchase needs
    queryset = PurchaseNeed.objects.select_related("product", "customer").all()

    # Apply status filter
    if status:
        queryset = queryset.filter(status=status.upper())

    # Apply source module filter
    if source_module:
        queryset = queryset.filter(source_module=source_module.upper())

    # Apply search filter (customer name or product name)
    if search:
        queryset = queryset.filter(
            Q(customer__name__icontains=search) |
            Q(product__name__icontains=search) |
            Q(product__product_code__icontains=search) |
            Q(product_name_snapshot__icontains=search)
        )

    # Get total count BEFORE pagination
    filtered_count = queryset.count()

    # Calculate KPI summary (from ENTIRE filtered dataset, not just this page)
    summary = {
        "total_open": PurchaseNeed.objects.filter(status="OPEN").count(),
        "total_all": PurchaseNeed.objects.count(),
        "by_source": {},
    }

    # Get count by source module
    source_counts = (
        PurchaseNeed.objects
        .values("source_module")
        .annotate(count=Count("id"))
    )
    for item in source_counts:
        summary["by_source"][item["source_module"]] = item["count"]

    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset.order_by("-created_at", "-id")[start_idx:end_idx]

    # Calculate pagination info
    num_pages = (filtered_count + page_size - 1) // page_size if filtered_count > 0 else 1

    # Build result rows
    results = []
    for need in paginated_queryset:
        result = {
            "id": need.id,
            "need_no": need.need_no,
            "product_id": need.product_id,
            "product_name": need.product.name if need.product else need.product_name_snapshot,
            "product_code": need.product.product_code if need.product else "",
            "source_module": need.source_module,
            "required_quantity": f"{need.required_quantity:.3f}",
            "available_quantity": f"{need.available_quantity:.3f}",
            "shortage_quantity": f"{need.shortage_quantity:.3f}",
            "customer_name": need.customer.name if need.customer else None,
            "priority": need.priority,
            "status": need.status,
            "created_at": need.created_at.isoformat() if need.created_at else None,
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
