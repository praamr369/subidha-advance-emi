from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    Vendor,
    VendorSettlement,
)
from accounting.services.purchase_bill_posting_service import approve_purchase_bill, post_purchase_bill_from_accounting
from accounting.services.vendor_settlement_service import post_vendor_settlement
from inventory.models import InventoryItem, PurchaseBill, PurchaseBillLine, PurchaseBillStatus, StockLedger, StockMovementType
from tests.helpers import create_admin_user, create_product


class PurchaseBillAndVendorSettlementTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="purchase_bill_admin", phone="9381300001")
        product = create_product(name="Purchase Item", product_code="PB-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="PB-SKU-001",
            opening_stock_qty=Decimal("2.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("700.00"),
        )
        self.vendor = Vendor.objects.create(name="Vendor One", phone="8800000001")
        cash_chart = ChartOfAccount.objects.create(
            code="PB-CASH-001",
            name="Purchase Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_account = FinanceAccount.objects.create(
            name="Purchase Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_purchase_bill_posting_and_vendor_settlement(self):
        purchase_bill = PurchaseBill.objects.create(
            bill_no="PB-202604-001",
            bill_date=date(2026, 4, 20),
            vendor=self.vendor,
            tax_mode="GST",
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("180.00"),
            grand_total=Decimal("1180.00"),
            finance_account=self.cash_account,
        )
        PurchaseBillLine.objects.create(
            purchase_bill=purchase_bill,
            inventory_item=self.item,
            description="Purchase line",
            quantity=Decimal("1.000"),
            unit_cost=Decimal("1000.00"),
            taxable_value=Decimal("1000.00"),
            tax_amount=Decimal("180.00"),
            line_total=Decimal("1180.00"),
        )

        purchase_bill, approved = approve_purchase_bill(
            purchase_bill_id=purchase_bill.id,
            approved_by=self.admin,
        )
        self.assertTrue(approved)
        self.assertEqual(purchase_bill.status, PurchaseBillStatus.APPROVED)

        purchase_bill, posted = post_purchase_bill_from_accounting(
            purchase_bill_id=purchase_bill.id,
            posted_by=self.admin,
        )
        self.assertTrue(posted)
        self.assertEqual(purchase_bill.status, PurchaseBillStatus.POSTED)
        self.assertIsNotNone(purchase_bill.posted_journal_entry_id)
        self.assertTrue(
          StockLedger.objects.filter(
              inventory_item=self.item,
              movement_type=StockMovementType.PURCHASE_IN,
              reference_model="PurchaseBillLine",
          ).exists()
        )

        settlement = VendorSettlement.objects.create(
            vendor=self.vendor,
            settlement_date=date(2026, 4, 21),
            amount=Decimal("1180.00"),
            finance_account=self.cash_account,
            purchase_bill=purchase_bill,
        )
        settlement, settlement_posted = post_vendor_settlement(
            vendor_settlement_id=settlement.id,
            posted_by=self.admin,
        )
        self.assertTrue(settlement_posted)
        self.assertEqual(settlement.status, "POSTED")
        self.assertEqual(
            sum(item.debit_amount for item in settlement.posted_journal_entry.lines.all()),
            sum(item.credit_amount for item in settlement.posted_journal_entry.lines.all()),
        )

