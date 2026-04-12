from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillLine,
    PurchaseBillStatus,
    StockLocation,
    StockAdjustment,
    StockAdjustmentStatus,
    StockLedger,
    StockMovementType,
)
from inventory.services.audit_service import log_inventory_event
from subscriptions.models import AuditLog


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


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
        )
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
            quantity_out=_quantity(quantity_out),
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


@transaction.atomic
def post_stock_adjustment(*, stock_adjustment_id: int, posted_by):
    adjustment = (
        StockAdjustment.objects.select_for_update()
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=stock_adjustment_id)
    )
    if adjustment.status == StockAdjustmentStatus.POSTED and adjustment.posted_journal_entry_id:
        return adjustment, False
    if adjustment.status not in {StockAdjustmentStatus.APPROVED, StockAdjustmentStatus.POSTED}:
        raise ValueError("Only approved stock adjustments can be posted.")
    if not (adjustment.reason or "").strip():
        raise ValueError("Reason is required before posting a stock adjustment.")

    created_count = 0
    existing_count = 0
    for line in adjustment.lines.all():
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
    adjustment_amount = sum(
        (
            abs(Decimal(str(line.quantity_delta or "0.000")))
            * Decimal(str(line.unit_cost or "0.00"))
        )
        for line in adjustment.lines.all()
    )
    adjustment_journal = None
    if adjustment_amount > Decimal("0.00"):
        accounts = ensure_phase3_system_accounts()
        movement_side = next(
            (line.quantity_delta for line in adjustment.lines.all() if line.quantity_delta != 0),
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
    lines = [
        {
            "chart_account": accounts["INVENTORY_ASSET"],
            "description": purchase_bill.bill_no,
            "debit_amount": inventory_total,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": credit_account,
            "description": purchase_bill.bill_no,
            "debit_amount": Decimal("0.00"),
            "credit_amount": purchase_bill.grand_total,
        },
    ]
    if tax_total > 0:
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
        },
        posted_by=posted_by,
    )
    purchase_bill.posted_journal_entry = journal_entry
    purchase_bill.status = PurchaseBillStatus.POSTED
    purchase_bill.save(update_fields=["posted_journal_entry", "status", "updated_at"])
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
    return purchase_bill, True


def build_stock_summary(
    *,
    item_id: int | None = None,
    stock_item_type: str | None = None,
    branch_id: int | None = None,
):
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
    rows = []
    for item in queryset:
        on_hand = item.current_stock_quantity()
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
                "opening_stock_qty": f"{item.opening_stock_qty:.3f}",
                "reorder_level_qty": f"{item.reorder_level_qty:.3f}",
                "on_hand_qty": f"{on_hand:.3f}",
                "is_below_reorder": on_hand <= item.reorder_level_qty,
                "default_stock_location_id": item.default_stock_location_id,
                "default_stock_location_code": getattr(item.default_stock_location, "code", None),
                "default_stock_location_name": getattr(item.default_stock_location, "name", None),
                "branch_id": getattr(item.default_stock_location, "branch_id", None),
            }
        )
    return {"count": len(rows), "results": rows}


def build_stock_ledger(
    *,
    item_id: int | None = None,
    location_id: int | None = None,
    start_date=None,
    end_date=None,
    movement_type: str | None = None,
    reference_model: str | None = None,
    branch_id: int | None = None,
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
    queryset = queryset.order_by("-movement_date", "-created_at", "-id")

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
        for row in queryset
    ]
    return {"count": len(results), "results": results}
