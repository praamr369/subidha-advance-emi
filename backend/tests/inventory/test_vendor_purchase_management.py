from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, Vendor
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    GoodsReceiptStatus,
    InventoryItem,
    InventoryItemType,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    StockLedger,
    StockMovementType,
    VendorBill,
    VendorBillLine,
    VendorBillStatus,
)
from inventory.services.procurement_service import cancel_purchase_order, post_goods_receipt, post_vendor_bill
from tests.helpers import create_admin_user, create_product, ensure_test_accounting_posting_prerequisites

_REF_DATE = date(2026, 4, 30)


class VendorPurchaseManagementTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="procure_admin", phone="9381301001")
        ensure_test_accounting_posting_prerequisites(_REF_DATE, performed_by=self.admin)
        self.vendor = Vendor.objects.create(name="Procure Vendor", phone="9898989898")
        product = create_product(name="Vendor PO Product", product_code="VPO-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="VPO-SKU-001",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            opening_stock_qty=Decimal("2.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("400.00"),
        )
        bank_chart = ChartOfAccount.objects.create(
            code="PROC-BANK-001",
            name="Procurement Bank",
            account_type=ChartOfAccountType.ASSET,
        )
        self.bank_account = FinanceAccount.objects.create(
            name="Procurement Bank A/C",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_create_vendor_and_purchase_order_and_cancel_draft_only(self):
        self.assertTrue(Vendor.objects.filter(name="Procure Vendor").exists())
        po = PurchaseOrder.objects.create(po_no="PO-20260430-001", po_date=date(2026, 4, 30), vendor=self.vendor)
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            inventory_item=self.item,
            quantity=Decimal("5.000"),
            unit_cost=Decimal("350.00"),
            tax_amount=Decimal("63.00"),
        )
        self.assertEqual(po.status, PurchaseOrderStatus.DRAFT)
        _, cancelled = cancel_purchase_order(purchase_order_id=po.id, performed_by=self.admin)
        self.assertTrue(cancelled)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrderStatus.CANCELLED)

        locked_po = PurchaseOrder.objects.create(
            po_no="PO-20260430-002",
            po_date=date(2026, 4, 30),
            vendor=self.vendor,
            status=PurchaseOrderStatus.SENT,
        )
        with self.assertRaises(ValueError):
            cancel_purchase_order(purchase_order_id=locked_po.id, performed_by=self.admin)

    def test_goods_receipt_posts_stock_ledger_and_vendor_bill_mapping(self):
        po = PurchaseOrder.objects.create(po_no="PO-20260430-003", po_date=date(2026, 4, 30), vendor=self.vendor)
        po_line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            inventory_item=self.item,
            quantity=Decimal("3.000"),
            unit_cost=Decimal("500.00"),
            tax_amount=Decimal("270.00"),
        )
        receipt = GoodsReceipt.objects.create(
            receipt_no="GR-20260430-001",
            receipt_date=date(2026, 4, 30),
            purchase_order=po,
        )
        GoodsReceiptLine.objects.create(
            goods_receipt=receipt,
            purchase_order_line=po_line,
            inventory_item=self.item,
            quantity_received=Decimal("3.000"),
            unit_cost=Decimal("500.00"),
        )
        before_stock = self.item.current_stock_quantity()
        receipt, updated = post_goods_receipt(goods_receipt_id=receipt.id, posted_by=self.admin)
        self.assertTrue(updated)
        self.assertEqual(receipt.status, GoodsReceiptStatus.RECEIVED)
        self.assertEqual(receipt.purchase_order.status, PurchaseOrderStatus.RECEIVED)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.item,
                movement_type=StockMovementType.PURCHASE_IN,
                reference_model="GoodsReceiptLine",
                reference_id=f"{receipt.id}:{receipt.lines.first().id}",
            ).exists()
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), before_stock + Decimal("3.000"))

        bill = VendorBill.objects.create(
            bill_no="VB-20260430-001",
            bill_date=date(2026, 4, 30),
            vendor=self.vendor,
            purchase_order=po,
            goods_receipt=receipt,
            finance_account=self.bank_account,
            subtotal=Decimal("1500.00"),
            tax_total=Decimal("270.00"),
            grand_total=Decimal("1770.00"),
        )
        VendorBillLine.objects.create(
            vendor_bill=bill,
            inventory_item=self.item,
            description="RM purchase",
            quantity=Decimal("3.000"),
            unit_cost=Decimal("500.00"),
            taxable_value=Decimal("1500.00"),
            tax_amount=Decimal("270.00"),
            line_total=Decimal("1770.00"),
        )
        bill, posted = post_vendor_bill(vendor_bill_id=bill.id, posted_by=self.admin)
        self.assertTrue(posted)
        self.assertEqual(bill.status, VendorBillStatus.POSTED)
        self.assertIsNotNone(bill.posted_journal_entry_id)
        debit_codes = {line.chart_account.system_code for line in bill.posted_journal_entry.lines.filter(debit_amount__gt=0)}
        credit_codes = {line.chart_account.system_code for line in bill.posted_journal_entry.lines.filter(credit_amount__gt=0)}
        self.assertIn("INVENTORY_ASSET", debit_codes)
        self.assertIn("INPUT_GST", debit_codes)
        self.assertIn("ACCOUNTS_PAYABLE", credit_codes)
