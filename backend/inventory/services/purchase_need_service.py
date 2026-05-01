from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from inventory.models import PurchaseNeed, PurchaseNeedStatus, Warehouse


QUANTITY_ZERO = Decimal("0.000")


@dataclass
class StockNeedSignal:
    product_id: int
    required_quantity: Decimal
    available_quantity: Decimal
    shortage_quantity: Decimal
    source_object_id: str
    customer_id: int | None = None
    note: str = ""
    priority: str = PurchaseNeed.Priority.MEDIUM


def _primary_warehouse() -> Warehouse | None:
    return Warehouse.objects.filter(is_active=True).order_by("id").first()


def upsert_direct_sale_purchase_need(*, signal: StockNeedSignal, created_by=None) -> PurchaseNeed | None:
    if signal.shortage_quantity <= QUANTITY_ZERO:
        return None
    warehouse = _primary_warehouse()
    if warehouse is None:
        return None

    need, _ = PurchaseNeed.objects.update_or_create(
        product_id=signal.product_id,
        warehouse=warehouse,
        status=PurchaseNeedStatus.OPEN,
        source_module=PurchaseNeed.SourceModule.DIRECT_SALE,
        source_object_id=signal.source_object_id,
        defaults={
            "required_quantity": signal.required_quantity,
            "available_quantity": signal.available_quantity,
            "shortage_quantity": signal.shortage_quantity,
            "customer_id": signal.customer_id,
            "priority": signal.priority,
            "created_by": created_by if getattr(created_by, "pk", None) else None,
            "note": signal.note,
            "demand_snapshot": {
                "required_quantity": f"{signal.required_quantity:.3f}",
                "available_quantity": f"{signal.available_quantity:.3f}",
                "shortage_quantity": f"{signal.shortage_quantity:.3f}",
            },
        },
    )
    return need
