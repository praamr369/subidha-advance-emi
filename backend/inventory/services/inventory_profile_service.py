from __future__ import annotations

from decimal import Decimal
import secrets
from typing import Any

from django.db import transaction
from django.db.models import Max, Sum, Value
from django.db.models.functions import Coalesce

from inventory.models import InventoryItem, InventoryItemType, StockLedger, StockLocationType
from manufacturing.models import ManufacturingBom, ManufacturingBomStatus
from subscriptions.models import Product

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def _build_inventory_code(product: Product) -> str:
    base = ((product.product_code or "")[:18]).strip().upper() or f"P{product.id}"
    while True:
        candidate = f"INV-{base}-{secrets.token_hex(3).upper()}"
        if not InventoryItem.objects.filter(inventory_code=candidate).exists():
            return candidate


def _profile_status(item: InventoryItem) -> str:
    if not item.is_active:
        return InventoryItem.StockTrackingStatus.INACTIVE
    if item.current_stock_quantity() > QUANTITY_ZERO:
        return InventoryItem.StockTrackingStatus.STOCK_ACTIVE
    return InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK


@transaction.atomic
def prepare_inventory_profile_for_product(*, product_id: int, actor=None, stock_tracking_enabled: bool = True) -> tuple[InventoryItem, bool]:
    """Create or refresh the one inventory profile for a product.

    This is intentionally idempotent. It never creates StockLedger rows and never mutates
    subscription/contract pricing snapshots; it only creates or refreshes the product's
    inventory profile metadata.
    """
    product = Product.objects.select_for_update().get(pk=product_id)
    item = InventoryItem.objects.select_for_update().filter(product_id=product.id).first()
    created = False
    requested_tracking = bool(stock_tracking_enabled)

    if item is None:
        sku = ((product.sku or product.product_code or "")).strip().upper() or None
        item = InventoryItem.objects.create(
            product=product,
            inventory_code=_build_inventory_code(product),
            sku=sku,
            unit_of_measure=product.unit_of_measure or "PCS",
            stock_tracking_enabled=requested_tracking,
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            delivery_stock_bridge_enabled=bool(product.is_emi_enabled or product.is_direct_sale_enabled),
            stock_tracking_status=InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK,
            is_active=product.is_active,
        )
        created = True
    else:
        update_fields: list[str] = []
        if not item.inventory_code:
            item.inventory_code = _build_inventory_code(product)
            update_fields.append("inventory_code")
        if not item.sku and (product.sku or product.product_code):
            item.sku = (product.sku or product.product_code or "").strip().upper()
            update_fields.append("sku")
        if item.unit_of_measure != (product.unit_of_measure or "PCS"):
            item.unit_of_measure = product.unit_of_measure or "PCS"
            update_fields.append("unit_of_measure")
        if item.stock_tracking_enabled != requested_tracking:
            item.stock_tracking_enabled = requested_tracking
            update_fields.append("stock_tracking_enabled")
        expected_bridge = bool(product.is_emi_enabled or product.is_direct_sale_enabled)
        if item.delivery_stock_bridge_enabled != expected_bridge:
            item.delivery_stock_bridge_enabled = expected_bridge
            update_fields.append("delivery_stock_bridge_enabled")
        if item.is_active != product.is_active:
            item.is_active = product.is_active
            update_fields.append("is_active")
        next_status = _profile_status(item)
        if item.stock_tracking_status != next_status:
            item.stock_tracking_status = next_status
            update_fields.append("stock_tracking_status")
        if update_fields:
            item.save(update_fields=update_fields + ["updated_at"])

    return item, created


def get_inventory_profile_status(item: InventoryItem) -> str:
    return _profile_status(item)


def build_profile_stock_by_location(*, inventory_item: InventoryItem) -> dict[str, Any]:
    rows = (
        StockLedger.objects.filter(inventory_item_id=inventory_item.id)
        .values("stock_location_id", "stock_location__code", "stock_location__name", "stock_location__location_type")
        .annotate(
            quantity_in=Coalesce(Sum("quantity_in"), Value(QUANTITY_ZERO)),
            quantity_out=Coalesce(Sum("quantity_out"), Value(QUANTITY_ZERO)),
            last_movement=Coalesce(Max("movement_date"), Value(None)),  # type: ignore[name-defined]
        )
        .order_by("stock_location__name", "stock_location_id")
    )

    location_rows: list[dict[str, Any]] = []
    warehouse_qty = QUANTITY_ZERO
    showroom_qty = QUANTITY_ZERO
    last_movement_date = None
    for row in rows:
        on_hand = Decimal(str(row["quantity_in"] or QUANTITY_ZERO)) - Decimal(str(row["quantity_out"] or QUANTITY_ZERO))
        location_type = row["stock_location__location_type"] or ""
        if location_type == StockLocationType.WAREHOUSE:
            warehouse_qty += on_hand
        if location_type == StockLocationType.SHOWROOM:
            showroom_qty += on_hand
        movement_date = row.get("last_movement")
        if movement_date and (last_movement_date is None or movement_date > last_movement_date):
            last_movement_date = movement_date
        location_rows.append(
            {
                "stock_location_id": row["stock_location_id"],
                "stock_location_code": row["stock_location__code"],
                "stock_location_name": row["stock_location__name"],
                "stock_location_type": location_type,
                "on_hand_qty": f"{on_hand:.3f}",
            }
        )

    total_on_hand = inventory_item.current_stock_quantity()
    return {
        "warehouse_qty": f"{warehouse_qty:.3f}",
        "showroom_qty": f"{showroom_qty:.3f}",
        "total_on_hand_qty": f"{total_on_hand:.3f}",
        "reserved_qty": f"{inventory_item.reserved_qty():.3f}",
        "available_qty": f"{inventory_item.available_qty():.3f}",
        "last_movement_date": last_movement_date.isoformat() if last_movement_date else None,
        "locations": location_rows,
    }


def build_manufacturing_cost_profile(*, inventory_item: InventoryItem) -> dict[str, Any]:
    boms = (
        ManufacturingBom.objects.filter(
            finished_good_inventory_item_id=inventory_item.id,
            status__in=[ManufacturingBomStatus.ACTIVE, ManufacturingBomStatus.DRAFT],
        )
        .prefetch_related("lines", "lines__inventory_item")
        .order_by("-is_default", "-revision_no", "-id")
    )
    bom = boms.first()

    bom_lines: list[dict[str, Any]] = []
    bom_material_total = MONEY_ZERO
    if bom is not None:
        for line in bom.lines.all():
            unit_cost = line.inventory_item.standard_unit_cost or MONEY_ZERO
            required_qty = Decimal(str(line.quantity_per_unit or QUANTITY_ZERO))
            line_cost = required_qty * Decimal(str(unit_cost))
            bom_material_total += line_cost
            bom_lines.append(
                {
                    "bom_line_id": line.id,
                    "inventory_item_id": line.inventory_item_id,
                    "inventory_item_sku": line.inventory_item.sku,
                    "inventory_item_name": line.inventory_item.product.name,
                    "required_quantity": f"{required_qty:.3f}",
                    "material_unit_cost": f"{Decimal(str(unit_cost)):.2f}",
                    "line_estimated_cost": f"{line_cost:.2f}",
                }
            )

    raw_material_cost = inventory_item.manufacturing_raw_material_cost or MONEY_ZERO
    if bom_material_total > MONEY_ZERO:
        raw_material_cost = bom_material_total
    labour_cost = inventory_item.manufacturing_labour_cost or MONEY_ZERO
    overhead_cost = inventory_item.manufacturing_overhead_cost or MONEY_ZERO
    total_estimated_cost = raw_material_cost + labour_cost + overhead_cost

    return {
        "supported": True,
        "manufacturing_cost_enabled": inventory_item.manufacturing_cost_enabled,
        "raw_material_cost": f"{Decimal(str(raw_material_cost)):.2f}",
        "labour_cost": f"{Decimal(str(labour_cost)):.2f}",
        "overhead_cost": f"{Decimal(str(overhead_cost)):.2f}",
        "total_estimated_manufacturing_cost": f"{Decimal(str(total_estimated_cost)):.2f}",
        "finished_goods_output_qty": f"{Decimal(str(inventory_item.manufacturing_finished_goods_output_qty or Decimal('1.000'))):.3f}",
        "bom_id": bom.id if bom else None,
        "bom_no": bom.bom_no if bom else None,
        "bom_lines": bom_lines,
    }
