from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from inventory.models import (
    InventoryItem,
    OpeningStockBatch,
    OpeningStockEntry,
    OpeningStockEntrySource,
    OpeningStockEntryStatus,
    StockAdjustment,
    StockAdjustmentLine,
    StockAdjustmentStatus,
    StockLocation,
    StockMovementType,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.purchase_need_reconciliation_service import (
    reconcile_direct_sale_needs_after_inventory_in,
)
from inventory.services.stock_service import (
    create_stock_ledger_entry,
    generate_stock_adjustment_number,
)
from subscriptions.models import AuditLog

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")

UNIT_COST_REQUIRED_OPENING_MSG = "Unit cost is required before posting opening stock."

POSTED_IMMUTABLE_MSG = "Posted opening stock cannot be edited in place."
OPENING_CORRECTION_REASON_MSG = "Reason is required for opening stock correction."


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def create_opening_stock_entry(
    *,
    inventory_item_id: int,
    stock_location_id: int,
    quantity,
    effective_date,
    unit_cost_snapshot=None,
    note: str = "",
    created_by=None,
    source: str = OpeningStockEntrySource.MANUAL,
    batch=None,
    csv_row_number: int | None = None,
) -> OpeningStockEntry:
    item = InventoryItem.objects.select_related("product").get(pk=inventory_item_id)
    StockLocation.objects.get(pk=stock_location_id)
    qty = _quantity(quantity)
    if qty < QUANTITY_ZERO:
        raise ValueError("Quantity cannot be negative.")

    uc = None
    if unit_cost_snapshot is not None:
        uc = _money(unit_cost_snapshot)
    elif item.standard_unit_cost is not None:
        uc = _money(item.standard_unit_cost)

    entry = OpeningStockEntry.objects.create(
        batch=batch,
        csv_row_number=csv_row_number,
        inventory_item_id=inventory_item_id,
        stock_location_id=stock_location_id,
        quantity=qty,
        unit_cost_snapshot=uc,
        effective_date=effective_date,
        note=(note or "").strip(),
        status=OpeningStockEntryStatus.DRAFT,
        source=source,
        created_by=created_by,
    )
    log_inventory_event(
        action_type=AuditLog.ActionType.OPENING_STOCK_IMPORTED,
        instance=entry,
        performed_by=created_by,
        event="OPENING_STOCK_ENTRY_DRAFT_CREATED",
        metadata={
            "opening_stock_entry_id": entry.id,
            "inventory_item_id": entry.inventory_item_id,
            "stock_location_id": entry.stock_location_id,
            "effective_date": entry.effective_date.isoformat(),
            "phase": "draft",
        },
    )
    return entry


def update_opening_stock_entry_draft(*, entry_id: int, performed_by=None, **fields) -> OpeningStockEntry:
    entry = OpeningStockEntry.objects.select_related("inventory_item").select_for_update().get(pk=entry_id)
    if entry.status != OpeningStockEntryStatus.DRAFT:
        raise ValueError(POSTED_IMMUTABLE_MSG)

    if "inventory_item_id" in fields and fields["inventory_item_id"] is not None:
        InventoryItem.objects.get(pk=fields["inventory_item_id"])
        entry.inventory_item_id = fields["inventory_item_id"]
    if "stock_location_id" in fields and fields["stock_location_id"] is not None:
        StockLocation.objects.get(pk=fields["stock_location_id"])
        entry.stock_location_id = fields["stock_location_id"]
    if "quantity" in fields and fields["quantity"] is not None:
        qty = _quantity(fields["quantity"])
        if qty < QUANTITY_ZERO:
            raise ValueError("Quantity cannot be negative.")
        entry.quantity = qty
    if "effective_date" in fields and fields["effective_date"] is not None:
        entry.effective_date = fields["effective_date"]
    if "note" in fields and fields["note"] is not None:
        entry.note = str(fields["note"] or "").strip()
    if "unit_cost_snapshot" in fields:
        uc_raw = fields["unit_cost_snapshot"]
        if uc_raw is None:
            std = entry.inventory_item.standard_unit_cost
            entry.unit_cost_snapshot = _money(std) if std is not None else None
        else:
            entry.unit_cost_snapshot = _money(uc_raw)

    entry.save()
    log_inventory_event(
        action_type=AuditLog.ActionType.OPENING_STOCK_IMPORTED,
        instance=entry,
        performed_by=performed_by,
        event="OPENING_STOCK_ENTRY_DRAFT_UPDATED",
        metadata={"opening_stock_entry_id": entry.id, "phase": "draft"},
    )
    return entry


@transaction.atomic
def post_opening_stock_entry(*, entry_id: int, posted_by=None) -> tuple[OpeningStockEntry, bool]:
    entry = (
        OpeningStockEntry.objects.select_for_update()
        .select_related("inventory_item", "stock_location")
        .get(pk=entry_id)
    )
    if entry.status == OpeningStockEntryStatus.POSTED:
        return entry, False
    if entry.status != OpeningStockEntryStatus.DRAFT:
        raise ValueError("Only draft opening stock rows can be posted.")

    if entry.quantity <= QUANTITY_ZERO:
        raise ValueError("Posted opening quantity must be greater than zero.")

    resolved_cost = entry.unit_cost_snapshot
    if resolved_cost is None:
        std = entry.inventory_item.standard_unit_cost
        if std is None:
            raise ValueError(UNIT_COST_REQUIRED_OPENING_MSG)
        resolved_cost = _money(std)
    else:
        resolved_cost = _money(resolved_cost)

    qty_abs = _quantity(entry.quantity)
    valuation = _money(qty_abs * resolved_cost)

    save_fields = ["valuation_amount_snapshot", "updated_at"]
    entry.valuation_amount_snapshot = valuation
    if entry.unit_cost_snapshot is None:
        entry.unit_cost_snapshot = resolved_cost
        save_fields.insert(0, "unit_cost_snapshot")
    entry.save(update_fields=save_fields)

    _, created = create_stock_ledger_entry(
        inventory_item=entry.inventory_item,
        movement_type=StockMovementType.OPENING_BALANCE_IN,
        movement_date=entry.effective_date,
        stock_location=entry.stock_location,
        quantity_in=qty_abs,
        reference_model="OpeningStockEntry",
        reference_id=str(entry.id),
        notes=entry.note or f"Opening stock entry {entry.id}",
        posted_by=posted_by,
    )

    entry.status = OpeningStockEntryStatus.POSTED
    entry.posted_by = posted_by
    entry.posted_at = timezone.now()
    entry.save(update_fields=["status", "posted_by", "posted_at", "updated_at"])

    log_inventory_event(
        action_type=AuditLog.ActionType.OPENING_STOCK_IMPORTED,
        instance=entry,
        performed_by=posted_by,
        event="OPENING_STOCK_ENTRY_POSTED",
        metadata={
            "opening_stock_entry_id": entry.id,
            "inventory_item_id": entry.inventory_item_id,
            "stock_location_id": entry.stock_location_id,
            "ledger_created": created,
            "valuation_amount_snapshot": str(entry.valuation_amount_snapshot),
            "phase": "posted",
        },
    )
    reconcile_direct_sale_needs_after_inventory_in(
        product_ids=[entry.inventory_item.product_id],
        actor=posted_by,
    )
    return entry, True


@transaction.atomic
def cancel_opening_stock_entry(*, entry_id: int, performed_by=None) -> OpeningStockEntry:
    entry = OpeningStockEntry.objects.select_for_update().get(pk=entry_id)
    if entry.status != OpeningStockEntryStatus.DRAFT:
        raise ValueError("Only draft opening stock rows can be cancelled.")
    entry.status = OpeningStockEntryStatus.CANCELLED
    entry.cancelled_at = timezone.now()
    entry.save(update_fields=["status", "cancelled_at", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.OPENING_STOCK_IMPORTED,
        instance=entry,
        performed_by=performed_by,
        event="OPENING_STOCK_ENTRY_CANCELLED",
        metadata={"opening_stock_entry_id": entry.id},
    )
    return entry


@transaction.atomic
def create_opening_stock_correction_adjustment(
    *,
    entry_id: int,
    reason: str,
    quantity_delta,
    unit_cost_snapshot=None,
    adjustment_date=None,
    created_by=None,
) -> StockAdjustment:
    entry = OpeningStockEntry.objects.select_related("inventory_item").get(pk=entry_id)
    if entry.status != OpeningStockEntryStatus.POSTED:
        raise ValueError("Only posted opening stock can be corrected via stock adjustment.")
    if not (reason or "").strip():
        raise ValueError(OPENING_CORRECTION_REASON_MSG)

    dq = _quantity(quantity_delta)
    if dq == QUANTITY_ZERO:
        raise ValueError("Correction quantity_delta must be non-zero.")

    resolved_line_cost = None
    if unit_cost_snapshot is not None:
        resolved_line_cost = _money(unit_cost_snapshot)
    elif entry.unit_cost_snapshot is not None:
        resolved_line_cost = _money(entry.unit_cost_snapshot)
    elif entry.inventory_item.standard_unit_cost is not None:
        resolved_line_cost = _money(entry.inventory_item.standard_unit_cost)
    if resolved_line_cost is None:
        raise ValueError(UNIT_COST_REQUIRED_OPENING_MSG)

    eff_date = adjustment_date or timezone.localdate()
    adjustment = StockAdjustment.objects.create(
        adjustment_no=generate_stock_adjustment_number(adjustment_date=eff_date),
        adjustment_date=eff_date,
        status=StockAdjustmentStatus.DRAFT,
        reason=f"[Opening correction OS#{entry.id}] {(reason or '').strip()}",
        stock_location=entry.stock_location,
        created_by=created_by,
    )
    StockAdjustmentLine.objects.create(
        stock_adjustment=adjustment,
        inventory_item=entry.inventory_item,
        quantity_delta=dq,
        notes=f"Correction linked to opening stock entry {entry.id}",
        unit_cost_snapshot=resolved_line_cost,
    )
    entry.correction_adjustment = adjustment
    entry.save(update_fields=["correction_adjustment", "updated_at"])

    log_inventory_event(
        action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_CREATED,
        instance=adjustment,
        performed_by=created_by,
        event="OPENING_STOCK_CORRECTION_ADJUSTMENT_DRAFT",
        metadata={
            "opening_stock_entry_id": entry.id,
            "stock_adjustment_id": adjustment.id,
            "quantity_delta": str(dq),
        },
    )
    return adjustment


def ensure_opening_stock_batch(*, batch_key: str, original_filename: str = "", created_by=None) -> OpeningStockBatch:
    batch, _ = OpeningStockBatch.objects.update_or_create(
        batch_key=batch_key,
        defaults={
            "original_filename": (original_filename or "")[:255],
            "created_by": created_by,
        },
    )
    return batch
