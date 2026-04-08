from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillStatus,
    StockAdjustment,
    StockAdjustmentStatus,
    StockLedger,
    StockMovementType,
)
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def create_stock_ledger_entry(
    *,
    inventory_item,
    movement_type: str,
    movement_date,
    quantity_in: Decimal = Decimal("0.000"),
    quantity_out: Decimal = Decimal("0.000"),
    reference_model: str,
    reference_id: str,
    notes: str = "",
    posted_by=None,
    posted_journal_entry=None,
) -> tuple[StockLedger, bool]:
    try:
        entry = StockLedger.objects.create(
            inventory_item=inventory_item,
            movement_type=movement_type,
            movement_date=movement_date,
            quantity_in=_quantity(quantity_in),
            quantity_out=_quantity(quantity_out),
            reference_model=reference_model,
            reference_id=str(reference_id),
            notes=notes,
            posted_by=posted_by,
            posted_journal_entry=posted_journal_entry,
        )
        return entry, True
    except IntegrityError:
        existing = StockLedger.objects.get(
            inventory_item=inventory_item,
            movement_type=movement_type,
            reference_model=reference_model,
            reference_id=str(reference_id),
        )
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

    adjustment.status = StockAdjustmentStatus.APPROVED
    adjustment.approved_by = approved_by
    adjustment.approved_at = timezone.now()
    adjustment.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=adjustment,
        performed_by=approved_by,
        metadata={"event": "STOCK_ADJUSTMENT_APPROVED", "adjustment_id": adjustment.id},
    )
    return adjustment, True


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
            notes=adjustment.adjustment_no,
            posted_by=posted_by,
            **kwargs,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    adjustment.status = StockAdjustmentStatus.POSTED
    adjustment.posted_by = posted_by
    adjustment.posted_at = timezone.now()
    adjustment.save(update_fields=["status", "posted_by", "posted_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=adjustment,
        performed_by=posted_by,
        metadata={
            "event": "STOCK_ADJUSTMENT_POSTED",
            "adjustment_id": adjustment.id,
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
    if purchase_bill.status == PurchaseBillStatus.POSTED:
        return purchase_bill, False
    if purchase_bill.status != PurchaseBillStatus.APPROVED:
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


def build_stock_summary(*, item_id: int | None = None):
    queryset = InventoryItem.objects.select_related("product").all()
    if item_id:
        queryset = queryset.filter(pk=item_id)
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
                "opening_stock_qty": f"{item.opening_stock_qty:.3f}",
                "reorder_level_qty": f"{item.reorder_level_qty:.3f}",
                "on_hand_qty": f"{on_hand:.3f}",
                "is_below_reorder": on_hand <= item.reorder_level_qty,
            }
        )
    return {"count": len(rows), "results": rows}


def build_stock_ledger(*, item_id: int | None = None, start_date=None, end_date=None):
    queryset = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "posted_by").all()
    if item_id:
        queryset = queryset.filter(inventory_item_id=item_id)
    if start_date:
        queryset = queryset.filter(movement_date__gte=start_date)
    if end_date:
        queryset = queryset.filter(movement_date__lte=end_date)
    queryset = queryset.order_by("-movement_date", "-created_at", "-id")

    results = [
        {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "product_code": row.inventory_item.product.product_code,
            "product_name": row.inventory_item.product.name,
            "movement_type": row.movement_type,
            "quantity_in": f"{row.quantity_in:.3f}",
            "quantity_out": f"{row.quantity_out:.3f}",
            "movement_date": row.movement_date.isoformat(),
            "reference_model": row.reference_model,
            "reference_id": row.reference_id,
            "notes": row.notes,
            "posted_by_username": getattr(row.posted_by, "username", None),
            "posted_journal_entry_id": row.posted_journal_entry_id,
        }
        for row in queryset
    ]
    return {"count": len(results), "results": results}

