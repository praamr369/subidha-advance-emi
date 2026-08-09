"""
Lot Tracking Enterprise Service

Provides server-side pagination, filtering, and aggregation for inventory lots.
Supports:
- Multi-field search (lot_code, product, barcode, status)
- Status filtering (ACTIVE, DEPLETED, QUARANTINED, EXPIRED)
- Batch operations (export to CSV)
- Real-time KPI aggregation

Uses database-level COUNT/SUM for 100% accuracy regardless of dataset size.
"""

from django.db.models import Count, Q, Sum, F, DecimalField
from django.db.models.functions import Coalesce
from decimal import Decimal
from inventory.models import InventoryLot


def build_lot_tracking_list(
    search_query: str = "",
    status_filter: str = "",
    source_filter: str = "",
    priority_filter: str = "",
    page: int = 1,
    page_size: int = 50,
):
    """
    Build paginated lot list with KPI aggregation.

    Args:
        search_query: Search across lot_code, product__name, barcode
        status_filter: "ACTIVE", "DEPLETED", "QUARANTINED", "EXPIRED"
        source_filter: Optional source filtering
        priority_filter: Optional priority filtering
        page: Page number (1-indexed)
        page_size: Rows per page (20, 50, 100)

    Returns:
        {
            'count': int,
            'page': int,
            'page_size': int,
            'num_pages': int,
            'summary': {
                'total_lots': int,
                'active_lots': int,
                'depleted_lots': int,
                'quarantined_lots': int,
                'expired_lots': int,
                'total_quantity': Decimal,
                'critical_shortage_count': int,
            },
            'results': [
                {
                    'id': int,
                    'lot_code': str,
                    'product_id': int,
                    'product_name': str,
                    'sku': str,
                    'barcode': str,
                    'quantity': Decimal,
                    'status': str,
                    'created_at': datetime,
                    'warehouse_code': str,
                },
                ...
            ]
        }
    """
    # Start with base queryset
    queryset = InventoryLot.objects.select_related(
        'product',
        'warehouse',
    ).all()

    # Apply filters
    if search_query:
        search_q = (
            Q(lot_code__icontains=search_query)
            | Q(product__name__icontains=search_query)
            | Q(product__sku__icontains=search_query)
            | Q(barcode__icontains=search_query)
            | Q(product__product_code__icontains=search_query)
        )
        queryset = queryset.filter(search_q)

    if status_filter:
        queryset = queryset.filter(status=status_filter.upper())

    if source_filter:
        queryset = queryset.filter(source=source_filter.upper())

    if priority_filter:
        queryset = queryset.filter(priority=priority_filter.upper())

    # Calculate summary (before pagination)
    summary = {
        'total_lots': queryset.count(),
        'active_lots': queryset.filter(status='ACTIVE').count(),
        'depleted_lots': queryset.filter(status='DEPLETED').count(),
        'quarantined_lots': queryset.filter(status='QUARANTINED').count(),
        'expired_lots': queryset.filter(status='EXPIRED').count(),
        'total_quantity': queryset.aggregate(
            total=Coalesce(Sum('quantity'), Decimal('0'), output_field=DecimalField())
        )['total'],
        'critical_shortage_count': queryset.filter(
            quantity__lte=F('reorder_point')
        ).count(),
    }

    # Pagination
    total_count = summary['total_lots']
    num_pages = (total_count + page_size - 1) // page_size if total_count else 0
    page = min(page, num_pages) if num_pages > 0 else 1
    start_index = (page - 1) * page_size
    end_index = start_index + page_size

    # Slice for pagination
    paginated_queryset = queryset[start_index:end_index]

    # Serialize results
    results = [
        {
            'id': lot.id,
            'lot_code': lot.lot_code,
            'product_id': lot.product.id,
            'product_name': lot.product.name,
            'product_code': lot.product.product_code,
            'sku': lot.product.sku or "",
            'barcode': lot.barcode or "",
            'quantity': lot.quantity,
            'reorder_point': lot.reorder_point or Decimal('0'),
            'status': lot.status,
            'source': lot.source or "",
            'priority': lot.priority or "",
            'warehouse_code': lot.warehouse.code if lot.warehouse else "",
            'created_at': lot.created_at.isoformat() if lot.created_at else None,
            'updated_at': lot.updated_at.isoformat() if lot.updated_at else None,
        }
        for lot in paginated_queryset
    ]

    return {
        'count': total_count,
        'page': page,
        'page_size': page_size,
        'num_pages': num_pages,
        'has_next': page < num_pages,
        'has_previous': page > 1 and num_pages > 0,
        'range_start': start_index + 1 if paginated_queryset.exists() else 0,
        'range_end': start_index + len(results) if results else 0,
        'summary': summary,
        'results': results,
    }


def export_lots_csv(
    search_query: str = "",
    status_filter: str = "",
    source_filter: str = "",
):
    """
    Export filtered lots to CSV format.

    Returns:
        List of dicts suitable for csv.DictWriter
    """
    queryset = InventoryLot.objects.select_related(
        'product',
        'warehouse',
    ).all()

    if search_query:
        search_q = (
            Q(lot_code__icontains=search_query)
            | Q(product__name__icontains=search_query)
            | Q(barcode__icontains=search_query)
        )
        queryset = queryset.filter(search_q)

    if status_filter:
        queryset = queryset.filter(status=status_filter.upper())

    if source_filter:
        queryset = queryset.filter(source=source_filter.upper())

    rows = []
    for lot in queryset.order_by('-created_at'):
        rows.append({
            'Lot Code': lot.lot_code,
            'Product Code': lot.product.product_code,
            'Product Name': lot.product.name,
            'SKU': lot.product.sku or "",
            'Barcode': lot.barcode or "",
            'Quantity': str(lot.quantity),
            'Reorder Point': str(lot.reorder_point or 0),
            'Status': lot.status,
            'Source': lot.source or "",
            'Priority': lot.priority or "",
            'Warehouse': lot.warehouse.code if lot.warehouse else "",
            'Created At': lot.created_at.isoformat() if lot.created_at else "",
        })

    return rows


def auto_generate_lot_code(product_code: str, sequence: int = 1) -> str:
    """
    Generate lot code in format: LOT-{PRODUCTCODE}-{SEQUENCE:04d}
    Example: LOT-CHAIR-0001
    """
    code = product_code.strip().upper()
    seq = str(sequence).zfill(4)
    return f"LOT-{code}-{seq}"
