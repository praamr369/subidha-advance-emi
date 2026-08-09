"""
Purchase Needs List Service - Database-level aggregation and filtering
"""

from decimal import Decimal
from django.db.models import Count, Sum, Q, F
from inventory.models import PurchaseNeed, Warehouse


def build_purchase_needs_list(
    search: str = "",
    status: str = "",
    source_module: str = "",
    priority: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """
    Build purchase needs list with database-level KPI aggregation.

    Args:
        search: Search by product name or need number
        status: Filter by status (OPEN, IN_REVIEW, ORDERED, etc.)
        source_module: Filter by source module (DIRECT_SALE, SUBSCRIPTION_DEMAND, etc.)
        priority: Filter by priority (LOW, MEDIUM, HIGH, URGENT)
        page: Page number (1-indexed)
        page_size: Records per page

    Returns:
        {
            'count': total_count,
            'page': page_num,
            'page_size': page_size,
            'num_pages': total_pages,
            'summary': {
                'total_needs': count,
                'total_shortage_qty': sum,
                'open_count': count,
                'fulfilled_count': count,
                'statuses': [list],
                'source_modules': [list],
                'priorities': [list],
            },
            'results': [records]
        }
    """
    # Build queryset
    queryset = PurchaseNeed.objects.select_related(
        'product',
        'warehouse',
        'created_by',
        'customer',
    )

    # Apply filters
    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) |
            Q(product__product_code__icontains=search) |
            Q(need_no__icontains=search)
        )

    if status:
        queryset = queryset.filter(status=status)

    if source_module:
        queryset = queryset.filter(source_module=source_module)

    if priority:
        queryset = queryset.filter(priority=priority)

    # Get total count before pagination
    total_count = queryset.count()
    num_pages = (total_count + page_size - 1) // page_size

    # Calculate KPI at database level (before pagination)
    aggregation = queryset.aggregate(
        total_shortage=Sum('shortage_quantity'),
        open_count=Count('id', filter=Q(status='OPEN')),
        fulfilled_count=Count('id', filter=Q(status='FULFILLED')),
        ds_count=Count('id', filter=Q(source_module='DIRECT_SALE')),
        sd_count=Count('id', filter=Q(source_module='SUBSCRIPTION_DEMAND')),
        gen_count=Count('id', filter=Q(source_module='GENERAL')),
        wd_count=Count('id', filter=Q(source_module='WINNER_DELIVERY')),
    )

    # Get unique values for filters
    statuses_list = list(set(
        queryset.values_list('status', flat=True).distinct()
    ))
    source_modules_list = list(set(
        queryset.values_list('source_module', flat=True).distinct()
    ))
    priorities_list = list(set(
        queryset.values_list('priority', flat=True).distinct()
    ))

    # Paginate
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset[start_idx:end_idx]

    # Build results
    results = []
    for need in paginated_queryset:
        results.append({
            'id': need.id,
            'need_no': need.need_no,
            'product_id': need.product_id,
            'product_code': need.product.product_code if need.product else '',
            'product_name': need.product_name_snapshot or (need.product.name if need.product else ''),
            'warehouse_id': need.warehouse_id,
            'warehouse_code': need.warehouse.code if need.warehouse else '',
            'warehouse_name': need.warehouse.name if need.warehouse else '',
            'required_quantity': str(need.required_quantity),
            'available_quantity': str(need.available_quantity),
            'shortage_quantity': str(need.shortage_quantity),
            'status': need.status,
            'source_module': need.source_module,
            'source_object_id': need.source_object_id,
            'priority': need.priority,
            'customer_id': need.customer_id,
            'customer_name': need.customer.name if need.customer else '',
            'created_by_username': need.created_by.username if need.created_by else '—',
            'note': need.note,
            'created_at': need.created_at.isoformat() if need.created_at else None,
            'fulfilled_at': need.fulfilled_at.isoformat() if need.fulfilled_at else None,
        })

    return {
        'count': total_count,
        'page': page,
        'page_size': page_size,
        'num_pages': num_pages,
        'summary': {
            'total_open': aggregation['open_count'] or 0,
            'total_all': total_count,
            'by_source': {
                'DIRECT_SALE': aggregation['ds_count'] or 0,
                'SUBSCRIPTION_DEMAND': aggregation['sd_count'] or 0,
                'GENERAL': aggregation['gen_count'] or 0,
                'WINNER_DELIVERY': aggregation['wd_count'] or 0,
            },
        },
        'results': results,
    }
