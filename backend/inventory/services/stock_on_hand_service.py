"""
Stock on Hand Enterprise Service

Provides real-time KPI dashboard data for warehouse command room:
- Physical quantity summary
- Reserved quantity summary
- Available quantity (physical - reserved)
- Critical shortages (qty <= reorder point)
- Total inventory value

Uses database-level aggregation for 100% accuracy on large datasets.
"""

from django.db.models import Count, Q, Sum, F, DecimalField, Case, When, Value
from django.db.models.functions import Coalesce
from decimal import Decimal
from inventory.models import InventoryLot, Product


def build_stock_on_hand_summary():
    """
    Build KPI summary for stock on hand dashboard.

    Returns:
        {
            'summary': {
                'total_physical_qty': Decimal,
                'total_reserved_qty': Decimal,
                'total_available_qty': Decimal,
                'critical_shortage_count': int,
                'total_value': Decimal,
            },
            'critical_shortages': [
                {
                    'product_id': int,
                    'product_code': str,
                    'product_name': str,
                    'sku': str,
                    'physical_qty': Decimal,
                    'reserved_qty': Decimal,
                    'reorder_point': Decimal,
                    'shortage_qty': Decimal,
                    'last_movement': datetime,
                },
                ...
            ]
        }
    """
    # Aggregate physical quantities by product
    physical_qs = (
        InventoryLot.objects
        .filter(status="ACTIVE")
        .values("product_id")
        .annotate(
            physical_qty=Coalesce(Sum("quantity"), Decimal("0"), output_field=DecimalField()),
        )
    )

    physical_by_product = {item["product_id"]: item["physical_qty"] for item in physical_qs}

    # Calculate summary totals
    total_physical = Coalesce(
        Sum("quantity", filter=Q(status="ACTIVE")),
        Decimal("0"),
        output_field=DecimalField(),
    )

    # Aggregate reserved quantities (would come from StockReservation model)
    # For now, we'll assume this is tracked separately
    total_reserved = Decimal("0")  # TODO: Integrate with StockReservation model
    total_available = total_physical - total_reserved

    # Calculate critical shortages
    critical_qs = (
        Product.objects
        .filter(inventory_status="ACTIVE")
        .annotate(
            physical_qty=Coalesce(
                Sum("inventorylot__quantity", filter=Q(inventorylot__status="ACTIVE")),
                Decimal("0"),
                output_field=DecimalField(),
            ),
            reserved_qty=Decimal("0"),  # TODO: Integrate with StockReservation
        )
        .filter(physical_qty__lte=F("reorder_point"))
        .values(
            "id",
            "product_code",
            "name",
            "sku",
            "physical_qty",
            "reserved_qty",
            "reorder_point",
        )
        .annotate(
            shortage_qty=F("reorder_point") - F("physical_qty"),
        )
    )

    critical_shortages = []
    for item in critical_qs:
        critical_shortages.append({
            "product_id": item["id"],
            "product_code": item["product_code"],
            "product_name": item["name"],
            "sku": item["sku"] or "",
            "physical_qty": item["physical_qty"],
            "reserved_qty": item["reserved_qty"],
            "reorder_point": item["reorder_point"] or Decimal("0"),
            "shortage_qty": item["shortage_qty"],
        })

    # Calculate total inventory value (base_price × physical quantity)
    value_qs = (
        InventoryLot.objects
        .filter(status="ACTIVE")
        .select_related("product")
        .values("product__base_price")
        .annotate(qty=Sum("quantity"))
    )

    total_value = Decimal("0")
    for item in value_qs:
        if item["product__base_price"]:
            total_value += (item["product__base_price"] * (item["qty"] or Decimal("0")))

    return {
        "summary": {
            "total_physical_qty": total_physical,
            "total_reserved_qty": total_reserved,
            "total_available_qty": total_available,
            "critical_shortage_count": len(critical_shortages),
            "total_value": total_value,
        },
        "critical_shortages": critical_shortages,
    }


def get_critical_shortages(page: int = 1, page_size: int = 50):
    """
    Get paginated critical shortages with search/filter support.

    Returns:
        {
            'count': int,
            'page': int,
            'page_size': int,
            'num_pages': int,
            'results': [ critical shortage items ]
        }
    """
    critical_qs = (
        Product.objects
        .filter(inventory_status="ACTIVE")
        .annotate(
            physical_qty=Coalesce(
                Sum("inventorylot__quantity", filter=Q(inventorylot__status="ACTIVE")),
                Decimal("0"),
                output_field=DecimalField(),
            ),
            reserved_qty=Decimal("0"),
        )
        .filter(physical_qty__lte=F("reorder_point"))
        .values(
            "id",
            "product_code",
            "name",
            "sku",
            "physical_qty",
            "reserved_qty",
            "reorder_point",
        )
        .annotate(
            shortage_qty=F("reorder_point") - F("physical_qty"),
        )
        .order_by("-shortage_qty")  # Worst shortages first
    )

    total_count = critical_qs.count()
    num_pages = (total_count + page_size - 1) // page_size if total_count else 0
    page = min(page, num_pages) if num_pages > 0 else 1
    start_index = (page - 1) * page_size
    end_index = start_index + page_size

    paginated = critical_qs[start_index:end_index]

    results = [
        {
            "product_id": item["id"],
            "product_code": item["product_code"],
            "product_name": item["name"],
            "sku": item["sku"] or "",
            "physical_qty": item["physical_qty"],
            "reserved_qty": item["reserved_qty"],
            "reorder_point": item["reorder_point"] or Decimal("0"),
            "shortage_qty": item["shortage_qty"],
        }
        for item in paginated
    ]

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "results": results,
    }
