from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from accounting.services.purchase_tax_service import (
    build_purchase_tax_snapshot,
    should_post_input_gst,
)
from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillLine,
    PurchaseBillStatus,
    SOFT_HOLD_MOVEMENT_TYPES,
    StockLocation,
    StockAdjustment,
    StockAdjustmentStatus,
    StockLedger,
    StockMovementType,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.purchase_need_reconciliation_service import (
    reconcile_direct_sale_needs_after_inventory_in,
)
from subscriptions.models import AuditLog


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def attach_bulk_stock_quantities(items) -> list[InventoryItem]:
    """
    Precompute physical and reserved stock for many InventoryItems in two
    grouped queries and attach them as per-instance caches, so subsequent
    calls to current_stock_quantity()/reserved_qty()/available_qty() are free.

    Dashboards and readiness reports that loop over every item were issuing
    two SUM queries per item (500+ queries for ~250 items); this collapses
    that to two queries total while reusing the exact same aggregation
    semantics as the model methods.
    """
    rows = list(items)
    if not rows:
        return rows
    item_ids = [item.id for item in rows]

    zero = Decimal("0")
    physical_map: dict[int, tuple[Decimal, Decimal]] = {}
    for agg in (
        StockLedger.objects.filter(inventory_item_id__in=item_ids)
        .exclude(movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES))
        .values("inventory_item_id")
        .annotate(total_in=Sum("quantity_in"), total_out=Sum("quantity_out"))
    ):
        physical_map[agg["inventory_item_id"]] = (
            Decimal(str(agg["total_in"] or zero)),
            Decimal(str(agg["total_out"] or zero)),
        )

    reserved_map: dict[int, tuple[Decimal, Decimal]] = {}
    for agg in (
        StockLedger.objects.filter(
            inventory_item_id__in=item_ids,
            movement_type__in=[StockMovementType.SALE_RESERVE, StockMovementType.SALE_RELEASE],
        )
        .values("inventory_item_id")
        .annotate(reserved_in=Sum("quantity_in"), reserved_out=Sum("quantity_out"))
    ):
        reserved_map[agg["inventory_item_id"]] = (
            Decimal(str(agg["reserved_in"] or zero)),
            Decimal(str(agg["reserved_out"] or zero)),
        )

    for item in rows:
        total_in, total_out = physical_map.get(item.id, (zero, zero))
        item._physical_stock_cache = (
            total_in - total_out + Decimal(str(item.opening_stock_qty or zero))
        )
        reserved_in, reserved_out = reserved_map.get(item.id, (zero, zero))
        item._reserved_stock_cache = max(zero, reserved_in - reserved_out)
    return rows


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def generate_stock_adjustment_number(*, adjustment_date=None) -> str:
    effective_date = adjustment_date or timezone.localdate()
    date_part = effective_date.strftime("%Y%m%d")
    while True:
        candidate = f"ADJ-{date_part}-{get_random_string(4).upper()}"
        if not StockAdjustment.objects.filter(adjustment_no=candidate).exists():
            return candidate


def _normalize_purchase_bill_lines(*, lines: list[dict], tax_mode: str) -> list[dict]:
    normalized_lines: list[dict] = []
    if not lines:
        raise ValueError("At least one purchase bill line is required.")

    for line in lines:
        inventory_item = line.get("inventory_item")
        if not isinstance(inventory_item, InventoryItem):
            raise ValueError("Each purchase bill line must reference an inventory item.")
        if not inventory_item.stock_tracking_enabled:
            raise ValueError("Purchase bill lines require stock-tracked inventory items.")

        quantity = _quantity(line.get("quantity"))
        if quantity <= Decimal("0.000"):
            raise ValueError("Purchase bill quantity must be greater than zero.")

        unit_cost = _money(line.get("unit_cost"))
        taxable_value = _money(line.get("taxable_value"))
        if taxable_value <= Decimal("0.00"):
            taxable_value = _money(quantity * unit_cost)

        tax_amount = Decimal("0.00") if tax_mode == "NON_GST" else _money(line.get("tax_amount"))
        line_total = _money(line.get("line_total"))
        computed_total = _money(taxable_value + tax_amount)
        if line_total <= Decimal("0.00"):
            line_total = computed_total
        elif line_total != computed_total:
            raise ValueError("Purchase bill line total must equal taxable value plus tax amount.")

        normalized_lines.append(
            {
                "inventory_item": inventory_item,
                "description": (
                    str(line.get("description") or getattr(inventory_item.product, "name", "") or inventory_item.sku or "")
                ).strip(),
                "quantity": quantity,
                "unit_cost": unit_cost,
                "taxable_value": taxable_value,
                "tax_amount": tax_amount,
                "line_total": line_total,
            }
        )

    return normalized_lines


def _replace_purchase_bill_lines(*, purchase_bill: PurchaseBill, lines: list[dict]):
    purchase_bill.lines.all().delete()
    PurchaseBillLine.objects.bulk_create(
        [
            PurchaseBillLine(
                purchase_bill=purchase_bill,
                inventory_item=line["inventory_item"],
                description=line.get("description", ""),
                quantity=line["quantity"],
                unit_cost=line["unit_cost"],
                taxable_value=line["taxable_value"],
                tax_amount=line["tax_amount"],
                line_total=line["line_total"],
            )
            for line in lines
        ]
    )


@transaction.atomic
def upsert_purchase_bill_draft(
    *,
    bill_no: str,
    bill_date,
    vendor,
    tax_mode: str,
    branch=None,
    stock_location=None,
    finance_account=None,
    notes: str = "",
    lines: list[dict],
    purchase_bill_id: int | None = None,
    performed_by=None,
):
    normalized_lines = _normalize_purchase_bill_lines(lines=lines, tax_mode=str(tax_mode).strip().upper())
    subtotal = sum((_money(line["taxable_value"]) for line in normalized_lines), Decimal("0.00"))
    tax_total = sum((_money(line["tax_amount"]) for line in normalized_lines), Decimal("0.00"))
    grand_total = sum((_money(line["line_total"]) for line in normalized_lines), Decimal("0.00"))

    if purchase_bill_id is None:
        purchase_bill = PurchaseBill(
            bill_no=bill_no,
            bill_date=bill_date,
            vendor=vendor,
            tax_mode=tax_mode,
            branch=branch,
            stock_location=stock_location,
            finance_account=finance_account,
            notes=notes,
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            tax_profile_snapshot={},
        )
        purchase_bill.tax_profile_snapshot = build_purchase_tax_snapshot(purchase_bill=purchase_bill)
        purchase_bill.save()
        _replace_purchase_bill_lines(purchase_bill=purchase_bill, lines=normalized_lines)
        _log_accounting_event(
            event="INVENTORY_PURCHASE_BILL_CREATED",
            instance=purchase_bill,
            performed_by=performed_by,
            metadata={
                "purchase_bill_id": purchase_bill.id,
                "bill_no": purchase_bill.bill_no,
                "vendor_id": purchase_bill.vendor_id,
                "branch_id": purchase_bill.branch_id,
                "stock_location_id": purchase_bill.stock_location_id,
                "line_count": len(normalized_lines),
                "grand_total": f"{grand_total:.2f}",
            },
        )
        return purchase_bill

    purchase_bill = PurchaseBill.objects.select_for_update().get(pk=purchase_bill_id)
    if purchase_bill.status != PurchaseBillStatus.DRAFT:
        raise ValueError("Only draft purchase bills can be edited.")

    purchase_bill.bill_no = bill_no
    purchase_bill.bill_date = bill_date
    purchase_bill.vendor = vendor
    purchase_bill.tax_mode = tax_mode
    purchase_bill.branch = branch
    purchase_bill.stock_location = stock_location
    purchase_bill.finance_account = finance_account
    purchase_bill.notes = notes
    purchase_bill.subtotal = subtotal
    purchase_bill.tax_total = tax_total
    purchase_bill.grand_total = grand_total
    purchase_bill.tax_profile_snapshot = build_purchase_tax_snapshot(purchase_bill=purchase_bill)
    purchase_bill.save()
    _replace_purchase_bill_lines(purchase_bill=purchase_bill, lines=normalized_lines)
    _log_accounting_event(
        event="INVENTORY_PURCHASE_BILL_UPDATED",
        instance=purchase_bill,
        performed_by=performed_by,
        metadata={
            "purchase_bill_id": purchase_bill.id,
            "bill_no": purchase_bill.bill_no,
            "vendor_id": purchase_bill.vendor_id,
            "branch_id": purchase_bill.branch_id,
            "stock_location_id": purchase_bill.stock_location_id,
            "line_count": len(normalized_lines),
            "grand_total": f"{grand_total:.2f}",
        },
    )
    return purchase_bill


def create_stock_ledger_entry(
    *,
    inventory_item,
    movement_type: str,
    movement_date,
    quantity_in: Decimal = Decimal("0.000"),
    quantity_out: Decimal = Decimal("0.000"),
    stock_location: StockLocation | None = None,
    reference_model: str,
    reference_id: str,
    notes: str = "",
    posted_by=None,
    posted_journal_entry=None,
) -> tuple[StockLedger, bool]:
    stock_location = stock_location or inventory_item.default_stock_location
    outbound_guard_types = {
        StockMovementType.EMI_DELIVERY_OUT,
        StockMovementType.DELIVERY_OUT,
    }
    qty_out = _quantity(quantity_out)
    if movement_type in outbound_guard_types and qty_out > Decimal("0.000"):
        if stock_location is None:
            location_available = _quantity(inventory_item.current_stock_quantity())
        else:
            aggregate = (
                inventory_item.stock_ledger.exclude(movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES))
                .filter(stock_location=stock_location)
                .aggregate(total_in=Sum("quantity_in"), total_out=Sum("quantity_out"))
            )
            location_total_in = _quantity(aggregate.get("total_in"))
            location_total_out = _quantity(aggregate.get("total_out"))
            opening_at_location = Decimal("0.000")
            if inventory_item.default_stock_location_id == stock_location.id:
                opening_at_location = _quantity(inventory_item.opening_stock_qty)
            location_available = opening_at_location + location_total_in - location_total_out
        if location_available < qty_out:
            raise ValueError(
                "Insufficient stock for outbound movement. "
                f"Available at location: {location_available:.3f}, requested: {qty_out:.3f}."
            )

    lookup = {
        "inventory_item": inventory_item,
        "movement_type": movement_type,
        "reference_model": reference_model,
        "reference_id": str(reference_id),
    }
    try:
        entry = StockLedger.objects.create(
            inventory_item=inventory_item,
            movement_type=movement_type,
            movement_date=movement_date,
            stock_location=stock_location,
            quantity_in=_quantity(quantity_in),
            quantity_out=qty_out,
            reference_model=reference_model,
            reference_id=str(reference_id),
            warehouse_name=getattr(stock_location, "name", ""),
            notes=notes,
            posted_by=posted_by,
            posted_journal_entry=posted_journal_entry,
        )
        return entry, True
    except (IntegrityError, ValidationError):
        existing = StockLedger.objects.filter(**lookup).first()
        if existing is None:
            raise
        return existing, False


def post_invoice_stock_movements(*, invoice, posted_by=None) -> dict:
    created_count = 0
    existing_count = 0
    for line in invoice.lines.select_related("inventory_item", "inventory_item__product").all():
        if not line.inventory_item_id or not line.inventory_item.stock_tracking_enabled:
            continue
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.SALE_OUT,
            movement_date=invoice.invoice_date,
            stock_location=line.inventory_item.default_stock_location,
            quantity_out=line.quantity,
            reference_model="BillingInvoiceLine",
            reference_id=f"{invoice.id}:{line.id}",
            notes=invoice.document_no or "",
            posted_by=posted_by,
            posted_journal_entry=invoice.posted_journal_entry,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {"created_count": created_count, "existing_count": existing_count}


def post_credit_note_stock_movements(*, note, posted_by=None) -> dict:
    created_count = 0
    existing_count = 0
    for line in note.lines.select_related("inventory_item", "inventory_item__product").all():
        if not line.inventory_item_id or not line.inventory_item.stock_tracking_enabled:
            continue
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.SALE_RETURN_IN,
            movement_date=note.note_date,
            stock_location=line.inventory_item.default_stock_location,
            quantity_in=line.quantity,
            reference_model="BillingCreditNoteLine",
            reference_id=f"{note.id}:{line.id}",
            notes=note.note_no or "",
            posted_by=posted_by,
            posted_journal_entry=note.posted_journal_entry,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {"created_count": created_count, "existing_count": existing_count}


def post_debit_note_stock_movements(*, note, posted_by=None) -> dict:
    created_count = 0
    existing_count = 0
    for line in note.lines.select_related("inventory_item", "inventory_item__product").all():
        if not line.inventory_item_id or not line.inventory_item.stock_tracking_enabled:
            continue
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.ADJUSTMENT_OUT,
            movement_date=note.note_date,
            stock_location=line.inventory_item.default_stock_location,
            quantity_out=line.quantity,
            reference_model="BillingDebitNoteLine",
            reference_id=f"{note.id}:{line.id}",
            notes=note.note_no or "",
            posted_by=posted_by,
            posted_journal_entry=note.posted_journal_entry,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {"created_count": created_count, "existing_count": existing_count}


@transaction.atomic
def approve_stock_adjustment(*, stock_adjustment_id: int, approved_by):
    adjustment = StockAdjustment.objects.select_for_update().get(pk=stock_adjustment_id)
    if adjustment.status == StockAdjustmentStatus.APPROVED:
        return adjustment, False
    if adjustment.status in {StockAdjustmentStatus.POSTED, StockAdjustmentStatus.CANCELLED}:
        raise ValueError("Only draft stock adjustments can be approved.")
    if not (adjustment.reason or "").strip():
        raise ValueError("Reason is required before approving a stock adjustment.")

    adjustment.status = StockAdjustmentStatus.APPROVED
    adjustment.approved_by = approved_by
    adjustment.approved_at = timezone.now()
    adjustment.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_APPROVED,
        instance=adjustment,
        performed_by=approved_by,
        event="STOCK_ADJUSTMENT_APPROVED",
        metadata={
            "adjustment_id": adjustment.id,
            "adjustment_no": adjustment.adjustment_no,
            "reason": adjustment.reason,
        },
    )
    return adjustment, True


UNIT_COST_REQUIRED_BEFORE_POSTING_MSG = (
    "Unit cost is required before posting this stock adjustment."
)
UNIT_COST_REQUIRED_CODE = "UNIT_COST_REQUIRED"

# Adjustment line valuation readiness states (display/contract only — these
# never change posting math, journal rules, or ledger immutability).
VALUATION_STATUS_READY = "READY"
VALUATION_STATUS_MISSING_UNIT_COST = "MISSING_UNIT_COST"
VALUATION_STATUS_NOT_APPLICABLE = "NOT_APPLICABLE"

# Statuses where line unit cost may still be set safely before any ledger /
# journal mutation has happened. Posting/cancellation are excluded.
_EDITABLE_PRE_POSTING_STATUSES = {
    StockAdjustmentStatus.DRAFT,
    StockAdjustmentStatus.APPROVED,
}


def resolve_effective_unit_cost(line) -> Decimal | None:
    """Resolve the effective unit cost used for valuation/posting.

    Preference order mirrors :func:`post_stock_adjustment` exactly so readiness
    previews never diverge from real posting behaviour:
      1. explicit line ``unit_cost_snapshot`` (frozen override)
      2. item ``standard_unit_cost`` fallback
      3. ``None`` when neither exists — never silently 0.
    """
    if line.unit_cost_snapshot is not None:
        return _money(line.unit_cost_snapshot)
    std = getattr(line.inventory_item, "standard_unit_cost", None)
    if std is not None:
        return _money(std)
    return None


def compute_adjustment_line_readiness(line) -> dict:
    """Return display-only valuation readiness for a single adjustment line.

    Missing cost is reported as ``None`` (unknown), never coerced to 0.
    """
    effective = resolve_effective_unit_cost(line)
    qty_abs = abs(_quantity(line.quantity_delta))
    has_standard_cost = getattr(line.inventory_item, "standard_unit_cost", None) is not None
    if effective is None:
        return {
            "effective_unit_cost": None,
            "line_valuation": None,
            "valuation_status": VALUATION_STATUS_MISSING_UNIT_COST,
            "has_standard_cost": has_standard_cost,
            "requires_unit_cost": True,
            "line_blocker": UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
        }
    line_valuation = _money(qty_abs * effective)
    return {
        "effective_unit_cost": effective,
        "line_valuation": line_valuation,
        "valuation_status": VALUATION_STATUS_READY,
        "has_standard_cost": has_standard_cost,
        "requires_unit_cost": False,
        "line_blocker": None,
    }


def compute_adjustment_posting_readiness(adjustment) -> dict:
    """Return whether an adjustment can be posted plus human-readable blockers.

    This is a read-only inspection used by the API list/detail payload and by
    the controlled posting error response. It does not mutate anything and does
    not relax the posting guard in :func:`post_stock_adjustment`.
    """
    blockers: list[str] = []
    line_errors: list[dict] = []
    lines = list(adjustment.lines.select_related("inventory_item").order_by("id"))

    if adjustment.status != StockAdjustmentStatus.APPROVED:
        blockers.append("Only approved stock adjustments can be posted.")
    if not (adjustment.reason or "").strip():
        blockers.append("Reason is required before posting a stock adjustment.")
    if not lines:
        blockers.append("Stock adjustment lines are required before posting.")

    missing_cost = False
    for line in lines:
        readiness = compute_adjustment_line_readiness(line)
        if readiness["requires_unit_cost"]:
            missing_cost = True
            line_errors.append(
                {
                    "line_id": line.id,
                    "inventory_item": line.inventory_item_id,
                    "code": UNIT_COST_REQUIRED_CODE,
                    "detail": UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
                }
            )
    if missing_cost:
        blockers.append(UNIT_COST_REQUIRED_BEFORE_POSTING_MSG)

    return {
        "can_post": not blockers,
        "posting_blockers": blockers,
        "line_errors": line_errors,
        "requires_unit_cost": missing_cost,
        "valuation_status": (
            VALUATION_STATUS_NOT_APPLICABLE
            if not lines
            else VALUATION_STATUS_MISSING_UNIT_COST
            if missing_cost
            else VALUATION_STATUS_READY
        ),
    }


@transaction.atomic
def set_stock_adjustment_line_unit_costs(*, stock_adjustment_id: int, unit_costs: dict, performed_by=None):
    """Set line ``unit_cost_snapshot`` values before posting (DRAFT/APPROVED).

    ``unit_costs`` maps line id -> unit cost (Decimal/str/number, or None to
    clear). Only the unit cost is touched — quantities, reasons, and ledger rows
    are never altered here. Refuses POSTED/CANCELLED so posted ledger valuation
    can never be retro-edited.
    """
    adjustment = (
        StockAdjustment.objects.select_for_update()
        .prefetch_related("lines")
        .get(pk=stock_adjustment_id)
    )
    if adjustment.status not in _EDITABLE_PRE_POSTING_STATUSES:
        raise ValueError(
            "Unit cost can only be edited while the adjustment is draft or approved (pre-posting)."
        )

    lines_by_id = {line.id: line for line in adjustment.lines.all()}
    updated = 0
    for raw_line_id, raw_cost in (unit_costs or {}).items():
        try:
            line_id = int(raw_line_id)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid line id: {raw_line_id!r}.")
        line = lines_by_id.get(line_id)
        if line is None:
            raise ValueError(f"Line {line_id} does not belong to this adjustment.")
        if raw_cost in (None, ""):
            new_cost = None
        else:
            new_cost = _money(raw_cost)
            if new_cost < Decimal("0.00"):
                raise ValueError("Unit cost cannot be negative.")
        if line.unit_cost_snapshot != new_cost:
            line.unit_cost_snapshot = new_cost
            line.save(update_fields=["unit_cost_snapshot", "updated_at"])
            updated += 1

    log_inventory_event(
        action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_UPDATED,
        instance=adjustment,
        performed_by=performed_by,
        event="STOCK_ADJUSTMENT_LINE_UNIT_COST_SET",
        metadata={
            "adjustment_id": adjustment.id,
            "adjustment_no": adjustment.adjustment_no,
            "updated_line_count": updated,
        },
    )
    return adjustment, updated


@transaction.atomic
def post_stock_adjustment(*, stock_adjustment_id: int, posted_by):
    adjustment = (
        StockAdjustment.objects.select_for_update()
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=stock_adjustment_id)
    )
    if adjustment.status == StockAdjustmentStatus.POSTED:
        return adjustment, False
    if adjustment.status != StockAdjustmentStatus.APPROVED:
        raise ValueError("Only approved stock adjustments can be posted.")
    if not (adjustment.reason or "").strip():
        raise ValueError("Reason is required before posting a stock adjustment.")

    lines_list = list(
        adjustment.lines.select_related("inventory_item").order_by("id")
    )
    if not lines_list:
        raise ValueError("Stock adjustment lines are required before posting.")

    adjustment_amount = Decimal("0.00")
    for line in lines_list:
        if line.unit_cost_snapshot is not None:
            resolved_unit_cost = _money(line.unit_cost_snapshot)
        else:
            std = line.inventory_item.standard_unit_cost
            if std is None:
                raise ValueError(UNIT_COST_REQUIRED_BEFORE_POSTING_MSG)
            resolved_unit_cost = _money(std)

        qty_abs = abs(_quantity(line.quantity_delta))
        line_valuation = _money(qty_abs * resolved_unit_cost)
        adjustment_amount += line_valuation

        save_fields = ["valuation_amount_snapshot", "updated_at"]
        line.valuation_amount_snapshot = line_valuation
        if line.unit_cost_snapshot is None:
            line.unit_cost_snapshot = resolved_unit_cost
            save_fields.insert(0, "unit_cost_snapshot")
        line.save(update_fields=save_fields)

    created_count = 0
    existing_count = 0
    for line in lines_list:
        movement_type = (
            StockMovementType.ADJUSTMENT_IN
            if line.quantity_delta > 0
            else StockMovementType.ADJUSTMENT_OUT
        )
        kwargs = {
            "quantity_in": line.quantity_delta if line.quantity_delta > 0 else Decimal("0.000"),
            "quantity_out": abs(line.quantity_delta) if line.quantity_delta < 0 else Decimal("0.000"),
        }
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=movement_type,
            movement_date=adjustment.adjustment_date,
            reference_model="StockAdjustmentLine",
            reference_id=f"{adjustment.id}:{line.id}",
            stock_location=adjustment.stock_location or line.inventory_item.default_stock_location,
            notes=adjustment.adjustment_no,
            posted_by=posted_by,
            **kwargs,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    adjustment.status = StockAdjustmentStatus.POSTED
    adjustment.posted_by = posted_by
    adjustment.posted_at = timezone.now()
    adjustment_journal = None
    if adjustment_amount > Decimal("0.00"):
        accounts = ensure_phase3_system_accounts()
        movement_side = next(
            (line.quantity_delta for line in lines_list if line.quantity_delta != 0),
            Decimal("0.000"),
        )
        journal_lines = (
            [
                {
                    "chart_account": accounts["INVENTORY_ASSET"],
                    "description": adjustment.adjustment_no,
                    "debit_amount": adjustment_amount,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["INVENTORY_ADJUSTMENT"],
                    "description": adjustment.reason,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": adjustment_amount,
                },
            ]
            if movement_side > 0
            else [
                {
                    "chart_account": accounts["INVENTORY_ADJUSTMENT"],
                    "description": adjustment.reason,
                    "debit_amount": adjustment_amount,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["INVENTORY_ASSET"],
                    "description": adjustment.adjustment_no,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": adjustment_amount,
                },
            ]
        )
        adjustment_journal, _ = post_bridge_entry(
            source_instance=adjustment,
            purpose="STOCK_ADJUSTMENT",
            entry_date=adjustment.adjustment_date,
            memo=f"Stock adjustment {adjustment.adjustment_no}",
            lines=journal_lines,
            voucher_type="STOCK_ADJUSTMENT",
            source_type="STOCK_ADJUSTMENT",
            source_reference=adjustment.adjustment_no,
            trace_metadata={
                "stock_adjustment_id": adjustment.id,
                "stock_location_id": adjustment.stock_location_id,
                "reason": adjustment.reason,
                "line_count": adjustment.lines.count(),
            },
            posted_by=posted_by,
        )
    adjustment.posted_journal_entry = adjustment_journal
    adjustment.save(
        update_fields=[
            "status",
            "posted_by",
            "posted_at",
            "posted_journal_entry",
            "updated_at",
        ]
    )
    log_inventory_event(
        action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_POSTED,
        instance=adjustment,
        performed_by=posted_by,
        event="STOCK_ADJUSTMENT_POSTED",
        metadata={
            "adjustment_id": adjustment.id,
            "adjustment_no": adjustment.adjustment_no,
            "reason": adjustment.reason,
            "created_count": created_count,
            "existing_count": existing_count,
        },
    )
    reconcile_direct_sale_needs_after_inventory_in(
        product_ids={line.inventory_item.product_id for line in lines_list},
        actor=posted_by,
    )
    return adjustment, True


@transaction.atomic
def post_purchase_bill(*, purchase_bill_id: int, posted_by):
    purchase_bill = (
        PurchaseBill.objects.select_for_update()
        .select_related("vendor", "finance_account", "finance_account__chart_account")
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=purchase_bill_id)
    )
    if purchase_bill.status == PurchaseBillStatus.POSTED and purchase_bill.posted_journal_entry_id:
        return purchase_bill, False
    if purchase_bill.status not in {PurchaseBillStatus.APPROVED, PurchaseBillStatus.POSTED}:
        raise ValueError("Only approved purchase bills can be posted.")

    accounts = ensure_phase3_system_accounts()
    inventory_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    created_count = 0
    existing_count = 0

    for line in purchase_bill.lines.all():
        inventory_total += Decimal(str(line.taxable_value or "0.00"))
        tax_total += Decimal(str(line.tax_amount or "0.00"))
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.PURCHASE_IN,
            movement_date=purchase_bill.bill_date,
            stock_location=purchase_bill.stock_location or line.inventory_item.default_stock_location,
            quantity_in=line.quantity,
            reference_model="PurchaseBillLine",
            reference_id=f"{purchase_bill.id}:{line.id}",
            notes=purchase_bill.bill_no,
            posted_by=posted_by,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    credit_account = (
        purchase_bill.finance_account.chart_account
        if purchase_bill.finance_account_id
        else accounts["ACCOUNTS_PAYABLE"]
    )
    post_input_gst = should_post_input_gst()
    inventory_debit_amount = inventory_total if post_input_gst else inventory_total + tax_total
    lines = [
        {
            "chart_account": accounts["INVENTORY_ASSET"],
            "description": purchase_bill.bill_no,
            "debit_amount": inventory_debit_amount,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": credit_account,
            "description": purchase_bill.bill_no,
            "debit_amount": Decimal("0.00"),
            "credit_amount": purchase_bill.grand_total,
        },
    ]
    if tax_total > 0 and post_input_gst:
        lines.insert(
            1,
            {
                "chart_account": accounts["INPUT_GST"],
                "description": f"Input GST {purchase_bill.bill_no}",
                "debit_amount": tax_total,
                "credit_amount": Decimal("0.00"),
            },
        )

    journal_entry, _ = post_bridge_entry(
        source_instance=purchase_bill,
        purpose="PURCHASE_BILL",
        entry_date=purchase_bill.bill_date,
        memo=f"Purchase bill {purchase_bill.bill_no}",
        lines=lines,
        voucher_type="PURCHASE_BILL",
        source_type="PURCHASE_BILL",
        source_reference=purchase_bill.bill_no,
        source_document_no=purchase_bill.bill_no,
        source_event_date=purchase_bill.bill_date,
        trace_metadata={
            "purchase_bill_id": purchase_bill.id,
            "vendor_id": purchase_bill.vendor_id,
            "finance_account_id": purchase_bill.finance_account_id,
            "stock_location_id": purchase_bill.stock_location_id,
            "itc_claimable": post_input_gst,
            "supplier_gst_as_cost": bool(tax_total > 0 and not post_input_gst),
        },
        posted_by=posted_by,
    )
    purchase_bill.posted_journal_entry = journal_entry
    purchase_bill.status = PurchaseBillStatus.POSTED
    purchase_bill.tax_profile_snapshot = build_purchase_tax_snapshot(purchase_bill=purchase_bill)
    purchase_bill.save(update_fields=["posted_journal_entry", "status", "tax_profile_snapshot", "updated_at"])
    _log_accounting_event(
        event="INVENTORY_PURCHASE_BILL_POSTED",
        instance=purchase_bill,
        performed_by=posted_by,
        metadata={
            "purchase_bill_id": purchase_bill.id,
            "created_count": created_count,
            "existing_count": existing_count,
            "journal_entry_id": journal_entry.id,
        },
    )
    reconcile_direct_sale_needs_after_inventory_in(
        product_ids={line.inventory_item.product_id for line in purchase_bill.lines.all()},
        actor=posted_by,
    )
    return purchase_bill, True


def build_stock_summary(
    *,
    item_id: int | None = None,
    stock_item_type: str | None = None,
    branch_id: int | None = None,
):
    from inventory.models import SOFT_HOLD_MOVEMENT_TYPES, StockMovementType
    from inventory.services.demand_planning_service import calculate_product_demand_bulk

    queryset = InventoryItem.objects.select_related("product", "default_stock_location").all()
    if item_id:
        queryset = queryset.filter(pk=item_id)
    if stock_item_type:
        queryset = queryset.filter(stock_item_type=stock_item_type)
    if branch_id:
        queryset = queryset.filter(
            models.Q(default_stock_location__branch_id=branch_id)
            | models.Q(stock_ledger__stock_location__branch_id=branch_id)
        ).distinct()

    items = list(queryset)
    if not items:
        return {"count": 0, "results": []}

    item_ids = [i.id for i in items]
    product_ids = [i.product_id for i in items]

    # Bulk physical stock: SUM(in) - SUM(out) excluding soft-hold movements, per item
    phys_qs = (
        StockLedger.objects.filter(inventory_item_id__in=item_ids)
        .exclude(movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES))
        .values("inventory_item_id")
        .annotate(total_in=models.Sum("quantity_in"), total_out=models.Sum("quantity_out"))
    )
    phys_map = {row["inventory_item_id"]: row for row in phys_qs}

    # Bulk reserved qty: SALE_RESERVE (in) minus SALE_RELEASE (out), per item
    reserve_qs = (
        StockLedger.objects.filter(
            inventory_item_id__in=item_ids,
            movement_type__in=[StockMovementType.SALE_RESERVE, StockMovementType.SALE_RELEASE],
        )
        .values("inventory_item_id")
        .annotate(reserved_in=models.Sum("quantity_in"), reserved_out=models.Sum("quantity_out"))
    )
    reserve_map = {row["inventory_item_id"]: row for row in reserve_qs}

    # Bulk demand — 5 queries total regardless of item count
    demand_map = calculate_product_demand_bulk(product_ids)

    ZERO = Decimal("0.000")

    rows = []
    for item in items:
        opening = Decimal(str(item.opening_stock_qty or ZERO))
        phys = phys_map.get(item.id, {})
        on_hand = (
            Decimal(str(phys.get("total_in") or ZERO))
            - Decimal(str(phys.get("total_out") or ZERO))
            + opening
        )
        res = reserve_map.get(item.id, {})
        reserved = max(
            ZERO,
            Decimal(str(res.get("reserved_in") or ZERO)) - Decimal(str(res.get("reserved_out") or ZERO)),
        )
        available = max(ZERO, on_hand - reserved)

        demand = demand_map.get(item.product_id, {
            "winners_pending_delivery": 0, "direct_sale_orders": 0, "rent_lease_commitments": 0,
        })
        rows.append(
            {
                "item_id": item.id,
                "product_id": item.product_id,
                "product_code": item.product.product_code,
                "product_name": item.product.name,
                "sku": item.sku,
                "unit_of_measure": item.unit_of_measure,
                "stock_tracking_enabled": item.stock_tracking_enabled,
                "stock_item_type": item.stock_item_type,
                "delivery_stock_bridge_enabled": item.delivery_stock_bridge_enabled,
                "opening_stock_qty": f"{opening:.3f}",
                "reorder_level_qty": f"{item.reorder_level_qty:.3f}",
                "on_hand_qty": f"{on_hand:.3f}",
                "reserved_qty": f"{reserved:.3f}",
                "available_qty": f"{available:.3f}",
                "incoming_qty": "0.000",
                "required_for_winners": str(demand["winners_pending_delivery"]),
                "required_for_confirmed_orders": str(
                    int(demand["direct_sale_orders"]) + int(demand["rent_lease_commitments"])
                ),
                "is_below_reorder": on_hand <= item.reorder_level_qty,
                "default_stock_location_id": item.default_stock_location_id,
                "default_stock_location_code": getattr(item.default_stock_location, "code", None),
                "default_stock_location_name": getattr(item.default_stock_location, "name", None),
                "branch_id": getattr(item.default_stock_location, "branch_id", None),
                "category": getattr(item.product, "category", "") or "",
                "subcategory": getattr(item.product, "subcategory", "") or "",
                "hsn_sac_code": getattr(item.product, "hsn_sac_code", "") or "",
                "gst_rate": str(getattr(item.product, "gst_rate", "0.00") or "0.00"),
                "base_price": str(getattr(item.product, "base_price", "0.00") or "0.00"),
                "standard_unit_cost": str(item.standard_unit_cost or "0.00"),
                "valuation_amount": str((on_hand * Decimal(str(item.standard_unit_cost or "0.00"))).quantize(Decimal("0.01"))),
                "stock_tracking_status": getattr(item, "stock_tracking_status", "PREPARED_NO_STOCK") or "PREPARED_NO_STOCK",
                "lifecycle_status": getattr(item.product, "lifecycle_status", "ACTIVE") or "ACTIVE",
            }
        )

    total_on_hand = sum(Decimal(r["on_hand_qty"]) for r in rows)
    total_reserved = sum(Decimal(r["reserved_qty"]) for r in rows)
    total_available = sum(Decimal(r["available_qty"]) for r in rows)
    total_valuation = sum(Decimal(r["valuation_amount"]) for r in rows)
    in_stock_count = sum(1 for r in rows if Decimal(r["on_hand_qty"]) > 0 and not r["is_below_reorder"])
    low_stock_count = sum(1 for r in rows if Decimal(r["on_hand_qty"]) > 0 and r["is_below_reorder"])
    out_of_stock_count = sum(1 for r in rows if Decimal(r["on_hand_qty"]) <= 0)

    return {
        "count": len(rows),
        "summary": {
            "total_on_hand_qty": f"{total_on_hand:.3f}",
            "total_reserved_qty": f"{total_reserved:.3f}",
            "total_available_qty": f"{total_available:.3f}",
            "total_valuation_amount": f"{total_valuation:.2f}",
            "in_stock_count": in_stock_count,
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
        },
        "results": rows,
    }


def build_stock_ledger(
    *,
    item_id: int | None = None,
    location_id: int | None = None,
    start_date=None,
    end_date=None,
    movement_type: str | None = None,
    reference_model: str | None = None,
    branch_id: int | None = None,
    direct_sale_id: int | None = None,
    direct_sale_return_id: int | None = None,
    exchange_return_id: int | None = None,
    purchase_return_id: int | None = None,
    credit_note_id: int | None = None,
    search: str | None = None,
    reference_search: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    queryset = StockLedger.objects.select_related(
        "inventory_item",
        "inventory_item__product",
        "posted_by",
        "stock_location",
    ).all()
    if item_id:
        queryset = queryset.filter(inventory_item_id=item_id)
    if start_date:
        queryset = queryset.filter(movement_date__gte=start_date)
    if end_date:
        queryset = queryset.filter(movement_date__lte=end_date)
    if location_id:
        queryset = queryset.filter(stock_location_id=location_id)
    if branch_id:
        queryset = queryset.filter(stock_location__branch_id=branch_id)
    if movement_type:
        movement_types = [value.strip().upper() for value in str(movement_type).split(",") if value.strip()]
        if movement_types:
            queryset = queryset.filter(movement_type__in=movement_types)
    if reference_model:
        queryset = queryset.filter(reference_model__iexact=str(reference_model).strip())
    if direct_sale_id:
        from billing.models import BillingInvoice

        invoice_ids = list(BillingInvoice.objects.filter(direct_sale_id=direct_sale_id).values_list("id", flat=True))
        sale_q = Q()
        for invoice_id in invoice_ids:
            sale_q |= Q(reference_model="BillingInvoiceLine", reference_id__startswith=f"{invoice_id}:")
        queryset = queryset.filter(sale_q) if sale_q else queryset.none()
    if direct_sale_return_id:
        queryset = queryset.filter(reference_model="DirectSaleReturnLine", reference_id__startswith=f"{direct_sale_return_id}:")
    if exchange_return_id:
        queryset = queryset.filter(
            Q(reference_model="DirectSaleReturnLine", reference_id__startswith=f"{exchange_return_id}:")
            | Q(reference_model="DirectSaleExchangeReplacement", reference_id__startswith=f"{exchange_return_id}:")
        )
    if purchase_return_id:
        queryset = queryset.filter(reference_model="PurchaseReturnLine", reference_id__startswith=f"{purchase_return_id}:")
    if credit_note_id:
        queryset = queryset.filter(reference_model="BillingCreditNoteLine", reference_id__startswith=f"{credit_note_id}:")

    # Deep search: product name, SKU, or product code
    if search:
        queryset = queryset.filter(
            Q(inventory_item__product__name__icontains=search)
            | Q(inventory_item__sku__icontains=search)
            | Q(inventory_item__product__product_code__icontains=search)
        )

    # Reference traceability: search by invoice ID or delivery ID
    if reference_search:
        queryset = queryset.filter(reference_id__icontains=reference_search)

    queryset = queryset.order_by("-movement_date", "-created_at", "-id")

    # Calculate totals across entire filtered dataset BEFORE pagination
    total_count = queryset.count()
    from django.db.models import Sum, DecimalField
    totals = queryset.aggregate(
        total_in=Sum('quantity_in', output_field=DecimalField()),
        total_out=Sum('quantity_out', output_field=DecimalField())
    )
    total_in = totals['total_in'] or Decimal('0.000')
    total_out = totals['total_out'] or Decimal('0.000')

    # Apply pagination
    page = max(1, page)
    page_size = min(page_size, 500)  # Cap at 500
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset[start_idx:end_idx]

    num_pages = (total_count + page_size - 1) // page_size

    results = [
        {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "product_code": row.inventory_item.product.product_code,
            "product_name": row.inventory_item.product.name,
            "stock_item_type": row.inventory_item.stock_item_type,
            "movement_type": row.movement_type,
            "quantity_in": f"{row.quantity_in:.3f}",
            "quantity_out": f"{row.quantity_out:.3f}",
            "movement_date": row.movement_date.isoformat(),
            "stock_location_id": row.stock_location_id,
            "stock_location_code": getattr(row.stock_location, "code", None),
            "stock_location_name": getattr(row.stock_location, "name", None),
            "branch_id": getattr(row.stock_location, "branch_id", None),
            "reference_model": row.reference_model,
            "reference_id": row.reference_id,
            "notes": row.notes,
            "posted_by_username": getattr(row.posted_by, "username", None),
            "posted_journal_entry_id": row.posted_journal_entry_id,
        }
        for row in paginated_queryset
    ]

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "total_in": f"{total_in:.3f}",
        "total_out": f"{total_out:.3f}",
        "results": results,
    }


def build_stock_adjustments(
    *,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
):
    """Build paginated stock adjustments with KPI counts at database level."""
    queryset = StockAdjustment.objects.select_related(
        "stock_location", "created_by", "approved_by", "posted_by"
    ).prefetch_related("lines", "lines__inventory_item", "lines__inventory_item__product").all()

    # Filter by status if provided
    if status:
        status = status.strip().upper()
        queryset = queryset.filter(status=status)

    # Search by adjustment number or reason
    if search:
        search = search.strip()
        queryset = queryset.filter(
            Q(adjustment_no__icontains=search) | Q(reason__icontains=search)
        )

    # Order by date and creation time
    queryset = queryset.order_by("-adjustment_date", "-created_at", "-id")

    # Calculate KPI counts for each status at database level (entire filtered dataset)
    all_adjustments = StockAdjustment.objects.all()
    kpi_counts = all_adjustments.values("status").annotate(count=models.Count("id"))
    kpi_map = {item["status"]: item["count"] for item in kpi_counts}

    # Get total count for pagination
    total_count = queryset.count()

    # Apply pagination
    page = max(1, page)
    page_size = min(page_size, 500)  # Cap at 500
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_queryset = queryset[start_idx:end_idx]

    num_pages = (total_count + page_size - 1) // page_size

    results = []
    for row in paginated_queryset:
        result = {
            "id": row.id,
            "adjustment_no": row.adjustment_no,
            "adjustment_date": row.adjustment_date.isoformat(),
            "status": row.status,
            "stock_location_id": row.stock_location_id,
            "stock_location_name": getattr(row.stock_location, "name", None),
            "reason": row.reason,
            "lines": [
                {
                    "id": line.id,
                    "inventory_item_id": line.inventory_item_id,
                    "inventory_item_sku": getattr(line.inventory_item, "sku", None),
                    "product_code": getattr(line.inventory_item.product, "product_code", None),
                    "product_name": getattr(line.inventory_item.product, "name", None),
                    "quantity_delta": f"{line.quantity_delta:.3f}",
                    "unit_cost_snapshot": f"{line.unit_cost_snapshot:.2f}" if line.unit_cost_snapshot else None,
                    "valuation_amount_snapshot": f"{line.valuation_amount_snapshot:.2f}" if line.valuation_amount_snapshot else None,
                    "line_valuation": line.line_valuation,
                    "requires_unit_cost": line.requires_unit_cost,
                    "notes": line.notes,
                }
                for line in row.lines.all()
            ],
            "requires_unit_cost": row.requires_unit_cost,
            "can_post": row.can_post,
            "created_by_username": getattr(row.created_by, "username", None),
            "approved_by_username": getattr(row.approved_by, "username", None),
            "posted_by_username": getattr(row.posted_by, "username", None),
            "created_at": row.created_at.isoformat(),
        }
        results.append(result)

    return {
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "draft_count": kpi_map.get("DRAFT", 0),
        "approved_count": kpi_map.get("APPROVED", 0),
        "posted_count": kpi_map.get("POSTED", 0),
        "results": results,
    }
