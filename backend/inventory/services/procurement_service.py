from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from accounting.models import VendorLedgerEntry
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptStatus,
    StockMovementType,
    VendorBill,
    VendorBillLine,
    VendorBillStatus,
    VendorPayment,
    VendorPaymentStatus,
    PurchaseOrder,
    PurchaseOrderStatus,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.purchase_need_reconciliation_service import (
    reconcile_direct_sale_needs_after_inventory_in,
)
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _vendor_ledger_balance(vendor_id: int) -> Decimal:
    row = VendorLedgerEntry.objects.filter(vendor_id=vendor_id).order_by("-posted_at", "-id").first()
    return _money(row.balance_after if row else Decimal("0.00"))


def _create_vendor_ledger_entry(*, vendor_id: int, entry_type: str, source_type: str, source_id: int, source_reference: str, debit: Decimal = Decimal("0.00"), credit: Decimal = Decimal("0.00"), posted_by=None, notes: str = ""):
    previous = _vendor_ledger_balance(vendor_id)
    debit_m = _money(debit)
    credit_m = _money(credit)
    balance_after = _money(previous + debit_m - credit_m)
    VendorLedgerEntry.objects.create(
        vendor_id=vendor_id,
        entry_type=entry_type,
        source_type=source_type,
        source_id=source_id,
        source_reference=source_reference,
        debit=debit_m,
        credit=credit_m,
        balance_after=balance_after,
        created_by=posted_by,
        notes=(notes or "").strip(),
    )


@transaction.atomic
def cancel_purchase_order(*, purchase_order_id: int, performed_by=None):
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order_id)
    if purchase_order.status == PurchaseOrderStatus.CANCELLED:
        return purchase_order, False
    if purchase_order.status != PurchaseOrderStatus.DRAFT:
        raise ValueError("Only draft purchase orders can be cancelled.")
    purchase_order.status = PurchaseOrderStatus.CANCELLED
    purchase_order.save(update_fields=["status", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.PURCHASE_ORDER_CANCELLED,
        instance=purchase_order,
        performed_by=performed_by,
        event="PURCHASE_ORDER_CANCELLED",
        metadata={"purchase_order_id": purchase_order.id, "po_no": purchase_order.po_no},
    )
    return purchase_order, True


@transaction.atomic
def post_goods_receipt(*, goods_receipt_id: int, posted_by=None):
    receipt = (
        GoodsReceipt.objects.select_for_update()
        .select_related("purchase_order", "purchase_order__vendor", "stock_location")
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=goods_receipt_id)
    )
    if receipt.status == GoodsReceiptStatus.RECEIVED:
        return receipt, False
    if receipt.status != GoodsReceiptStatus.DRAFT:
        raise ValueError("Only draft goods receipts can be posted.")

    created_count = 0
    existing_count = 0
    po_line_qty = {line.id: Decimal(str(line.quantity or "0.000")) for line in receipt.purchase_order.lines.all()}
    posted_receipts = receipt.purchase_order.receipts.exclude(status=GoodsReceiptStatus.CANCELLED)
    prior_received_by_line: dict[int, Decimal] = {}
    for row in posted_receipts.exclude(pk=receipt.pk).values("lines__purchase_order_line_id").annotate(total=Sum("lines__quantity_received")):
        line_id = row.get("lines__purchase_order_line_id")
        if line_id:
            prior_received_by_line[int(line_id)] = Decimal(str(row.get("total") or "0.000"))
    for line in receipt.lines.all():
        if line.purchase_order_line_id and line.purchase_order_line_id in po_line_qty:
            already = prior_received_by_line.get(line.purchase_order_line_id, Decimal("0.000"))
            ordered = po_line_qty[line.purchase_order_line_id]
            after = already + Decimal(str(line.quantity_received or "0.000"))
            if after > ordered and not receipt.allow_over_receive:
                raise ValueError(
                    f"Over-receive blocked for PO line {line.purchase_order_line_id}. Ordered {ordered}, received would become {after}."
                )
        _, created = create_stock_ledger_entry(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.PURCHASE_IN,
            movement_date=receipt.receipt_date,
            stock_location=receipt.stock_location or line.inventory_item.default_stock_location,
            quantity_in=line.quantity_received,
            reference_model="GoodsReceiptLine",
            reference_id=f"{receipt.id}:{line.id}",
            notes=receipt.receipt_no,
            posted_by=posted_by,
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1

    total_ordered = sum((line.quantity for line in receipt.purchase_order.lines.all()), Decimal("0.000"))
    total_received = sum(
        (
            qty
            for qty in receipt.purchase_order.receipts.exclude(status=GoodsReceiptStatus.CANCELLED).values_list(
                "lines__quantity_received", flat=True
            )
            if qty is not None
        ),
        Decimal("0.000"),
    )
    receipt.purchase_order.status = (
        PurchaseOrderStatus.RECEIVED if total_received >= total_ordered else PurchaseOrderStatus.PARTIALLY_RECEIVED
    )
    receipt.purchase_order.save(update_fields=["status", "updated_at"])

    receipt.status = GoodsReceiptStatus.RECEIVED
    receipt.posted_at = timezone.now()
    receipt.posted_by = posted_by
    receipt.save(update_fields=["status", "posted_at", "posted_by", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.GOODS_RECEIPT_POSTED,
        instance=receipt,
        performed_by=posted_by,
        event="GOODS_RECEIPT_POSTED",
        metadata={
            "goods_receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "purchase_order_id": receipt.purchase_order_id,
            "created_stock_entries": created_count,
            "existing_stock_entries": existing_count,
        },
    )
    reconcile_direct_sale_needs_after_inventory_in(
        product_ids={line.inventory_item.product_id for line in receipt.lines.all()},
        actor=posted_by,
    )
    return receipt, True


@transaction.atomic
def post_vendor_bill(*, vendor_bill_id: int, posted_by=None):
    bill = (
        VendorBill.objects.select_for_update()
        .select_related("vendor", "finance_account", "finance_account__chart_account")
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=vendor_bill_id)
    )
    if bill.status == VendorBillStatus.POSTED and bill.posted_journal_entry_id:
        return bill, False
    if bill.status != VendorBillStatus.DRAFT:
        raise ValueError("Only draft vendor bills can be posted.")

    accounts = ensure_phase3_system_accounts()
    inventory_total = Decimal("0.00")
    expense_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    for line in bill.lines.all():
        taxable_value = _money(line.taxable_value)
        if line.inventory_item.stock_tracking_enabled:
            inventory_total += taxable_value
        else:
            expense_total += taxable_value
        tax_total += _money(line.tax_amount)

    payable_account = accounts["ACCOUNTS_PAYABLE"]
    journal_lines = []
    if inventory_total > 0:
        journal_lines.append(
            {
                "chart_account": accounts["INVENTORY_ASSET"],
                "description": bill.bill_no,
                "debit_amount": inventory_total,
                "credit_amount": Decimal("0.00"),
            }
        )
    if expense_total > 0:
        journal_lines.append(
            {
                "chart_account": accounts["PURCHASE_EXPENSE"],
                "description": bill.bill_no,
                "debit_amount": expense_total,
                "credit_amount": Decimal("0.00"),
            }
        )
    if tax_total > 0:
        journal_lines.append(
            {
                "chart_account": accounts["INPUT_GST"],
                "description": f"Input GST {bill.bill_no}",
                "debit_amount": tax_total,
                "credit_amount": Decimal("0.00"),
            }
        )
    journal_lines.append(
        {
            "chart_account": payable_account,
            "description": bill.bill_no,
            "debit_amount": Decimal("0.00"),
            "credit_amount": _money(bill.grand_total),
        }
    )

    journal_entry, _ = post_bridge_entry(
        source_instance=bill,
        purpose="VENDOR_BILL",
        entry_date=bill.bill_date,
        memo=f"Vendor bill {bill.bill_no}",
        lines=journal_lines,
        voucher_type="VENDOR_BILL",
        source_type="VENDOR_BILL",
        source_reference=bill.bill_no,
        posted_by=posted_by,
    )
    bill.posted_journal_entry = journal_entry
    bill.status = VendorBillStatus.POSTED
    bill.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    if bill.purchase_order_id:
        bill.purchase_order.status = PurchaseOrderStatus.BILLED
        bill.purchase_order.save(update_fields=["status", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.VENDOR_BILL_POSTED,
        instance=bill,
        performed_by=posted_by,
        event="VENDOR_BILL_POSTED",
        metadata={"vendor_bill_id": bill.id, "bill_no": bill.bill_no, "journal_entry_id": journal_entry.id},
    )
    _create_vendor_ledger_entry(
        vendor_id=bill.vendor_id,
        entry_type="PURCHASE_BILL",
        source_type="VENDOR_BILL",
        source_id=bill.id,
        source_reference=bill.bill_no,
        debit=_money(bill.grand_total),
        posted_by=posted_by,
        notes=f"Vendor bill posted via journal {journal_entry.entry_no}.",
    )
    return bill, True


@transaction.atomic
def post_vendor_payment(*, vendor_payment_id: int, posted_by=None):
    payment = VendorPayment.objects.select_for_update().select_related(
        "finance_account", "finance_account__chart_account", "vendor", "vendor_bill"
    ).get(pk=vendor_payment_id)
    if payment.status == VendorPaymentStatus.POSTED and payment.posted_journal_entry_id:
        return payment, False
    if payment.status != VendorPaymentStatus.DRAFT:
        raise ValueError("Only draft vendor payments can be posted.")
    if payment.vendor_bill_id:
        prior_paid = VendorPayment.objects.filter(
            vendor_bill_id=payment.vendor_bill_id,
            status=VendorPaymentStatus.POSTED,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        bill_total = _money(payment.vendor_bill.grand_total)
        if _money(prior_paid) + _money(payment.amount) > bill_total:
            raise ValueError("Vendor payment exceeds linked vendor bill outstanding amount.")

    accounts = ensure_phase3_system_accounts()
    journal_entry, _ = post_bridge_entry(
        source_instance=payment,
        purpose="VENDOR_PAYMENT",
        entry_date=payment.payment_date,
        memo=f"Vendor payment {payment.payment_no}",
        lines=[
            {
                "chart_account": accounts["ACCOUNTS_PAYABLE"],
                "description": payment.vendor.name,
                "debit_amount": payment.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": payment.finance_account.chart_account,
                "description": payment.payment_no,
                "debit_amount": Decimal("0.00"),
                "credit_amount": payment.amount,
            },
        ],
        voucher_type="VENDOR_PAYMENT",
        source_type="VENDOR_PAYMENT",
        source_reference=payment.payment_no,
        posted_by=posted_by,
    )
    payment.posted_journal_entry = journal_entry
    payment.status = VendorPaymentStatus.POSTED
    payment.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    log_inventory_event(
        action_type=AuditLog.ActionType.VENDOR_PAYMENT_POSTED,
        instance=payment,
        performed_by=posted_by,
        event="VENDOR_PAYMENT_POSTED",
        metadata={"vendor_payment_id": payment.id, "payment_no": payment.payment_no},
    )
    _create_vendor_ledger_entry(
        vendor_id=payment.vendor_id,
        entry_type="PAYMENT_TO_VENDOR",
        source_type="VENDOR_PAYMENT",
        source_id=payment.id,
        source_reference=payment.payment_no,
        credit=_money(payment.amount),
        posted_by=posted_by,
        notes=f"Vendor payment posted via journal {journal_entry.entry_no}.",
    )
    return payment, True
