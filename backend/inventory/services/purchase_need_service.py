from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from inventory.models import PurchaseNeed, PurchaseNeedStatus, Warehouse


QUANTITY_ZERO = Decimal("0.000")


def direct_sale_purchase_need_source_key(*, sale_id: int, product_id: int) -> str:
    """Stable idempotency key: one open DIRECT_SALE need per sale + product."""
    return f"ds:{int(sale_id)}:p:{int(product_id)}"


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
    allow_zero_shortage: bool = False


def ensure_primary_warehouse() -> Warehouse:
    """
    PurchaseNeed rows require a warehouse FK. Bootstrap a single primary warehouse when none exists
    so operational flows (direct-sale requirements) do not silently drop records.
    """
    existing = Warehouse.objects.filter(is_active=True).order_by("id").first()
    if existing is not None:
        return existing
    warehouse, _ = Warehouse.objects.get_or_create(
        code="PRIMARY",
        defaults={
            "name": "Primary warehouse",
            "is_active": True,
            "notes": "Auto-created because no active warehouse existed.",
        },
    )
    return warehouse


def upsert_direct_sale_purchase_need(*, signal: StockNeedSignal, created_by=None) -> tuple[PurchaseNeed | None, bool]:
    if signal.shortage_quantity <= QUANTITY_ZERO and not signal.allow_zero_shortage:
        return None, False
    warehouse = ensure_primary_warehouse()

    need, created = PurchaseNeed.objects.update_or_create(
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
    return need, created
