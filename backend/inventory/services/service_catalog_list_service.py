"""
Service Catalog List Service

Server-side filtering, pagination, and KPI aggregation for the Service Catalog workbench.
"""

from __future__ import annotations

from django.db.models import Count, Q

from inventory.models import ServiceCatalogItem, ServiceCatalogItemStatus, ServiceType


def build_service_catalog_list(
    search: str | None = None,
    status: str | None = None,
    category: str | None = None,
    service_type: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Build paginated service catalog list with server-side filtering and KPI aggregation.

    Args:
        search: Search by name or code
        status: Filter by status (ACTIVE, INACTIVE)
        category: Filter by category
        service_type: Filter by service type
        page: Page number (1-indexed)
        page_size: Items per page (max 500)

    Returns:
        {
            "count": total_filtered_count,
            "page": current_page,
            "page_size": page_size,
            "num_pages": total_pages,
            "summary": {
                "total_services": int,
                "active_count": int,
                "inactive_count": int,
                "categories": [list of unique categories],
                "service_types": [list of unique service types],
            },
            "results": [service_row, ...]
        }
    """
    # Start with all services
    queryset = ServiceCatalogItem.objects.all()

    # Apply search filter
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) | Q(code__icontains=search)
        )

    # Apply status filter
    if status:
        queryset = queryset.filter(status=status)

    # Apply category filter
    if category:
        queryset = queryset.filter(category__icontains=category)

    # Apply service type filter
    if service_type:
        queryset = queryset.filter(service_type=service_type)

    # Get total count BEFORE pagination
    filtered_count = queryset.count()

    # Calculate KPI summary (from ENTIRE dataset, not just filtered page)
    all_services = ServiceCatalogItem.objects.all()
    summary_stats = all_services.aggregate(
        active_count=Count("id", filter=Q(status=ServiceCatalogItemStatus.ACTIVE)),
        inactive_count=Count("id", filter=Q(status=ServiceCatalogItemStatus.INACTIVE)),
    )

    # Get unique categories and service types
    categories = list(
        ServiceCatalogItem.objects.filter(category__gt="")
        .values_list("category", flat=True)
        .distinct()
        .order_by("category")
    )

    service_types = [
        {"value": v, "label": l} for v, l in ServiceType.choices
    ]

    summary = {
        "total_services": all_services.count(),
        "active_count": summary_stats.get("active_count") or 0,
        "inactive_count": summary_stats.get("inactive_count") or 0,
        "categories": categories,
        "service_types": service_types,
    }

    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset.order_by("category", "name", "id")[start_idx:end_idx]

    # Calculate pagination info
    num_pages = (filtered_count + page_size - 1) // page_size if filtered_count > 0 else 1

    # Build result rows
    results = []
    for service in paginated_queryset:
        result = {
            "id": service.id,
            "code": service.code,
            "name": service.name,
            "category": service.category or "—",
            "service_type": service.service_type,
            "service_type_label": dict(ServiceType.choices).get(service.service_type, "—"),
            "standard_price": str(service.standard_price),
            "tax_rate_percent": str(service.tax_rate_percent),
            "status": service.status,
            "hsn_sac_code": service.hsn_sac_code or "—",
            "created_at": service.created_at.isoformat() if service.created_at else None,
            "updated_at": service.updated_at.isoformat() if service.updated_at else None,
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
