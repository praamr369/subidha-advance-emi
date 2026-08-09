"""
Stock Ledger Enterprise Service

Provides immutable transaction log with:
- Fixed KPIs (database-level aggregation, not pagination-limited)
- Server-side pagination (50/page default)
- Deep search across 5 fields (product, reference, code, SKU, barcode)
- Reference traceability (clickable invoice/delivery links)
- CSV export for audits

Uses database-level SUM/COUNT for 100% accuracy regardless of dataset size.
"""

from django.db.models import Count, Q, Sum, F, DecimalField, Case, When, Value
from django.db.models.functions import Coalesce
from decimal import Decimal
from inventory.models import StockLedger


def build_stock_ledger_list(
    search_query: str = "",
    transaction_type_filter: str = "",
    reference_type_filter: str = "",
    date_from: str = "",
    date_to: str = "",
    page: int = 1,
    page_size: int = 50,
):
    """
    Build paginated stock ledger with KPI aggregation.

    Args:
        search_query: Search across product_name, product__sku, reference_display
        transaction_type_filter: RECEIPT, DISPATCH, ADJUSTMENT, RETURN
        reference_type_filter: INVOICE, DELIVERY, PO, ADJUSTMENT
        date_from: Filter from date (YYYY-MM-DD)
        date_to: Filter to date (YYYY-MM-DD)
        page: Page number (1-indexed)
        page_size: Rows per page (20, 50, 100)

    Returns:
        {
            'count': int,
            'page': int,
            'page_size': int,
            'num_pages': int,
            'summary': {
                'total_inbound': Decimal,
                'total_outbound': Decimal,
                'net_change': Decimal,
                'period': str,
            },
            'results': [
                {
                    'id': int,
                    'product_id': int,
                    'product_name': str,
                    'sku': str,
                    'barcode': str,
                    'transaction_type': str,
                    'quantity': Decimal,
                    'reference_type': str,
                    'reference_id': int,
                    'reference_display': str,
                    'created_at': datetime,
                },
                ...
            ]
        }
    """
    # Start with base queryset
    queryset = StockLedger.objects.select_related(
        'product',
    ).all()

    # Apply filters
    if search_query:
        search_q = (
            Q(product__name__icontains=search_query)
            | Q(product__sku__icontains=search_query)
            | Q(product__barcode__icontains=search_query)
            | Q(product__product_code__icontains=search_query)
            | Q(reference_display__icontains=search_query)
        )
        queryset = queryset.filter(search_q)

    if transaction_type_filter:
        queryset = queryset.filter(transaction_type=transaction_type_filter.upper())

    if reference_type_filter:
        queryset = queryset.filter(reference_type=reference_type_filter.upper())

    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)

    # Calculate summary (before pagination)
    total_inbound = queryset.filter(transaction_type__in=['RECEIPT', 'ADJUSTMENT']).aggregate(
        total=Coalesce(Sum('quantity'), Decimal('0'), output_field=DecimalField())
    )['total']

    total_outbound = queryset.filter(transaction_type__in=['DISPATCH', 'RETURN']).aggregate(
        total=Coalesce(Sum('quantity'), Decimal('0'), output_field=DecimalField())
    )['total']

    net_change = total_inbound - total_outbound

    # Pagination
    total_count = queryset.count()
    num_pages = (total_count + page_size - 1) // page_size if total_count else 0
    page = min(page, num_pages) if num_pages > 0 else 1
    start_index = (page - 1) * page_size
    end_index = start_index + page_size

    # Slice for pagination
    paginated_queryset = queryset.order_by('-created_at')[start_index:end_index]

    # Serialize results
    results = [
        {
            'id': ledger.id,
            'product_id': ledger.product.id,
            'product_name': ledger.product.name,
            'product_code': ledger.product.product_code,
            'sku': ledger.product.sku or "",
            'barcode': ledger.product.barcode or "",
            'transaction_type': ledger.transaction_type,
            'quantity': ledger.quantity,
            'reference_type': ledger.reference_type or "",
            'reference_id': ledger.reference_id or None,
            'reference_display': ledger.reference_display or "",
            'warehouse_code': ledger.warehouse.code if ledger.warehouse else "",
            'created_at': ledger.created_at.isoformat() if ledger.created_at else None,
        }
        for ledger in paginated_queryset
    ]

    # Date range string for summary
    if date_from or date_to:
        period = f"{date_from or 'start'} to {date_to or 'today'}"
    else:
        period = "all time"

    return {
        'count': total_count,
        'page': page,
        'page_size': page_size,
        'num_pages': num_pages,
        'has_next': page < num_pages,
        'has_previous': page > 1 and num_pages > 0,
        'range_start': start_index + 1 if paginated_queryset.exists() else 0,
        'range_end': start_index + len(results) if results else 0,
        'summary': {
            'total_inbound': total_inbound,
            'total_outbound': total_outbound,
            'net_change': net_change,
            'period': period,
        },
        'results': results,
    }


def export_ledger_csv(
    search_query: str = "",
    transaction_type_filter: str = "",
    reference_type_filter: str = "",
    date_from: str = "",
    date_to: str = "",
):
    """
    Export stock ledger to CSV format.

    Returns:
        List of dicts suitable for csv.DictWriter
    """
    queryset = StockLedger.objects.select_related(
        'product',
        'warehouse',
    ).all()

    if search_query:
        search_q = (
            Q(product__name__icontains=search_query)
            | Q(product__sku__icontains=search_query)
            | Q(reference_display__icontains=search_query)
        )
        queryset = queryset.filter(search_q)

    if transaction_type_filter:
        queryset = queryset.filter(transaction_type=transaction_type_filter.upper())

    if reference_type_filter:
        queryset = queryset.filter(reference_type=reference_type_filter.upper())

    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)

    rows = []
    for ledger in queryset.order_by('-created_at'):
        rows.append({
            'Created': ledger.created_at.isoformat() if ledger.created_at else "",
            'Product Code': ledger.product.product_code,
            'Product Name': ledger.product.name,
            'SKU': ledger.product.sku or "",
            'Barcode': ledger.product.barcode or "",
            'Transaction Type': ledger.transaction_type,
            'Quantity': str(ledger.quantity),
            'Reference Type': ledger.reference_type or "",
            'Reference ID': str(ledger.reference_id) if ledger.reference_id else "",
            'Reference Display': ledger.reference_display or "",
            'Warehouse': ledger.warehouse.code if ledger.warehouse else "",
        })

    return rows
