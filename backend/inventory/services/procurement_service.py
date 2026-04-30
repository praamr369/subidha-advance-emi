from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
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
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


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
    for line in receipt.lines.all():
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
    return payment, True
