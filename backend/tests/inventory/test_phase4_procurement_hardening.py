from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    Vendor,
    VendorLedgerEntry,
)
from billing.services.reversal_service import create_purchase_return, post_purchase_return
from inventory.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    InventoryItem,
    InventoryItemType,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderStatus,
    PurchaseBill,
    PurchaseBillLine,
    StockLedger,
    StockLocation,
    StockMovementType,
    VendorBill,
    VendorBillLine,
    VendorPayment,
)
from inventory.services.procurement_service import post_goods_receipt, post_vendor_bill, post_vendor_payment
from django.utils import timezone

from tests.helpers import create_admin_user, create_product, ensure_test_accounting_posting_prerequisites

_REF_DATE = date(2026, 5, 2)


class Phase4ProcurementHardeningTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="phase4_proc_admin", phone="9381401001")
        ensure_test_accounting_posting_prerequisites(_REF_DATE, performed_by=self.admin)
        _today = timezone.localdate()
        if _today != _REF_DATE:
            ensure_test_accounting_posting_prerequisites(_today, performed_by=self.admin)
        self.vendor = Vendor.objects.create(name="Phase4 Vendor", phone="9876543210")
        product = create_product(name="Phase4 RM", product_code="PH4-RM-001", base_price=Decimal("900.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="PH4-RM-SKU-001",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            opening_stock_qty=Decimal("10.000"),
            standard_unit_cost=Decimal("300.00"),
        )
        self.location = StockLocation.objects.create(code="PH4-STK", name="Phase4 Stock")
        self.coa = ChartOfAccount.objects.create(code="PH4-BANK-001", name="Phase4 Bank", account_type=ChartOfAccountType.ASSET)
        self.finance = FinanceAccount.objects.create(
            name="Phase4 Bank A/C", kind=FinanceAccountKind.BANK, chart_account=self.coa, opening_balance=Decimal("0.00")
        )

    def _posted_bill(self):
        po = PurchaseOrder.objects.create(po_no="PO-PH4-001", po_date=date(2026, 5, 1), vendor=self.vendor, stock_location=self.location)
        pol = PurchaseOrderLine.objects.create(
            purchase_order=po,
            inventory_item=self.item,
            quantity=Decimal("3.000"),
            unit_cost=Decimal("300.00"),
            tax_amount=Decimal("54.00"),
        )
        receipt = GoodsReceipt.objects.create(
            receipt_no="GR-PH4-001", receipt_date=date(2026, 5, 2), purchase_order=po, stock_location=self.location
        )
        GoodsReceiptLine.objects.create(
            goods_receipt=receipt,
            purchase_order_line=pol,
            inventory_item=self.item,
            quantity_received=Decimal("3.000"),
            unit_cost=Decimal("300.00"),
        )
        post_goods_receipt(goods_receipt_id=receipt.id, posted_by=self.admin)
        bill = VendorBill.objects.create(
            bill_no="VB-PH4-001",
            bill_date=date(2026, 5, 2),
            vendor=self.vendor,
            purchase_order=po,
            goods_receipt=receipt,
            finance_account=self.finance,
            subtotal=Decimal("900.00"),
            tax_total=Decimal("54.00"),
            grand_total=Decimal("954.00"),
        )
        VendorBillLine.objects.create(
            vendor_bill=bill,
            inventory_item=self.item,
            description="RM",
            quantity=Decimal("3.000"),
            unit_cost=Decimal("300.00"),
            taxable_value=Decimal("900.00"),
            tax_amount=Decimal("54.00"),
            line_total=Decimal("954.00"),
        )
        post_vendor_bill(vendor_bill_id=bill.id, posted_by=self.admin)
        return po, bill

    def test_po_over_receive_blocked_without_override(self):
        po = PurchaseOrder.objects.create(po_no="PO-PH4-OVR-1", po_date=date(2026, 5, 1), vendor=self.vendor, stock_location=self.location)
        pol = PurchaseOrderLine.objects.create(
            purchase_order=po,
            inventory_item=self.item,
            quantity=Decimal("2.000"),
            unit_cost=Decimal("300.00"),
            tax_amount=Decimal("0.00"),
        )
        receipt = GoodsReceipt.objects.create(receipt_no="GR-PH4-OVR-1", receipt_date=date(2026, 5, 2), purchase_order=po, stock_location=self.location)
        GoodsReceiptLine.objects.create(goods_receipt=receipt, purchase_order_line=pol, inventory_item=self.item, quantity_received=Decimal("2.000"), unit_cost=Decimal("300.00"))
        post_goods_receipt(goods_receipt_id=receipt.id, posted_by=self.admin)

        second = GoodsReceipt.objects.create(receipt_no="GR-PH4-OVR-2", receipt_date=date(2026, 5, 3), purchase_order=po, stock_location=self.location)
        GoodsReceiptLine.objects.create(goods_receipt=second, purchase_order_line=pol, inventory_item=self.item, quantity_received=Decimal("0.500"), unit_cost=Decimal("300.00"))
        with self.assertRaises(ValueError):
            post_goods_receipt(goods_receipt_id=second.id, posted_by=self.admin)

    def test_vendor_bill_and_payment_write_vendor_ledger_entries(self):
        _po, bill = self._posted_bill()
        self.assertTrue(VendorLedgerEntry.objects.filter(vendor=self.vendor, entry_type="PURCHASE_BILL", source_id=bill.id).exists())

        payment = VendorPayment.objects.create(
            payment_no="VP-PH4-001",
            payment_date=date(2026, 5, 4),
            vendor=self.vendor,
            vendor_bill=bill,
            amount=Decimal("300.00"),
            finance_account=self.finance,
        )
        post_vendor_payment(vendor_payment_id=payment.id, posted_by=self.admin)
        self.assertTrue(VendorLedgerEntry.objects.filter(vendor=self.vendor, entry_type="PAYMENT_TO_VENDOR", source_id=payment.id).exists())

    def test_vendor_payment_overpay_is_blocked(self):
        _po, bill = self._posted_bill()
        first = VendorPayment.objects.create(
            payment_no="VP-PH4-002",
            payment_date=date(2026, 5, 4),
            vendor=self.vendor,
            vendor_bill=bill,
            amount=Decimal("900.00"),
            finance_account=self.finance,
        )
        post_vendor_payment(vendor_payment_id=first.id, posted_by=self.admin)

        second = VendorPayment.objects.create(
            payment_no="VP-PH4-003",
            payment_date=date(2026, 5, 5),
            vendor=self.vendor,
            vendor_bill=bill,
            amount=Decimal("100.00"),
            finance_account=self.finance,
        )
        with self.assertRaises(ValueError):
            post_vendor_payment(vendor_payment_id=second.id, posted_by=self.admin)

    def test_purchase_return_reduces_stock_and_vendor_payable_ledger(self):
        _po, _bill = self._posted_bill()
        purchase_bill = PurchaseBill.objects.create(
            bill_no="PB-PH4-001",
            bill_date=date(2026, 5, 2),
            vendor=self.vendor,
            finance_account=self.finance,
            stock_location=self.location,
            status="POSTED",
            subtotal=Decimal("300.00"),
            tax_total=Decimal("18.00"),
            grand_total=Decimal("318.00"),
        )
        pb_line = PurchaseBillLine.objects.create(
            purchase_bill=purchase_bill,
            inventory_item=self.item,
            description="RM returnable",
            quantity=Decimal("1.000"),
            unit_cost=Decimal("300.00"),
            taxable_value=Decimal("300.00"),
            tax_amount=Decimal("18.00"),
            line_total=Decimal("318.00"),
        )
        before = self.item.current_stock_quantity()
        pr = create_purchase_return(
            purchase_bill_id=purchase_bill.id,
            lines=[{"purchase_bill_line_id": pb_line.id, "quantity": "1.000"}],
            reason="Damaged inbound",
            performed_by=self.admin,
            stock_location_id=self.location.id,
        )
        post_purchase_return(purchase_return_id=pr.id, posted_by=self.admin)
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), before - Decimal("1.000"))
        pr_line = pr.lines.order_by("id").first()
        self.assertIsNotNone(pr_line)
        self.assertTrue(
            StockLedger.objects.filter(
                reference_model="PurchaseReturnLine",
                reference_id=f"{pr.id}:{pr_line.id}",
                movement_type=StockMovementType.PURCHASE_RETURN_OUT,
            ).exists()
        )
        self.assertTrue(VendorLedgerEntry.objects.filter(vendor=self.vendor, entry_type="PURCHASE_RETURN", source_id=pr.id).exists())

    def test_receipt_posting_transition_keeps_po_status(self):
        po = PurchaseOrder.objects.create(po_no="PO-PH4-STATUS", po_date=date(2026, 5, 8), vendor=self.vendor)
        PurchaseOrderLine.objects.create(purchase_order=po, inventory_item=self.item, quantity=Decimal("1.000"), unit_cost=Decimal("100.00"), tax_amount=Decimal("0.00"))
        receipt = GoodsReceipt.objects.create(receipt_no="GR-PH4-STATUS", receipt_date=date(2026, 5, 8), purchase_order=po)
        GoodsReceiptLine.objects.create(goods_receipt=receipt, inventory_item=self.item, quantity_received=Decimal("1.000"), unit_cost=Decimal("100.00"))
        post_goods_receipt(goods_receipt_id=receipt.id, posted_by=self.admin)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrderStatus.RECEIVED)
