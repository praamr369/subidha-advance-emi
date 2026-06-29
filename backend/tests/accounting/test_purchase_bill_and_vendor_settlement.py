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
    VendorSettlement,
)
from accounting.services.purchase_bill_posting_service import approve_purchase_bill, post_purchase_bill_from_accounting
from accounting.services.vendor_settlement_service import post_vendor_settlement
from accounting.services.vendor_ledger_service import get_vendor_outstanding
from inventory.models import (
    InventoryItem,
    InventoryItemType,
    PurchaseBill,
    PurchaseBillLine,
    PurchaseBillStatus,
    StockLedger,
    StockMovementType,
)
from inventory.services.stock_service import upsert_purchase_bill_draft
from tests.helpers import create_admin_user, create_product, ensure_test_accounting_posting_prerequisites


class PurchaseBillAndVendorSettlementTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="purchase_bill_admin", phone="9381300001")
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 20), performed_by=self.admin)
        product = create_product(name="Purchase Item", product_code="PB-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="PB-SKU-001",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
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
        purchase_bill = upsert_purchase_bill_draft(
            bill_no="PB-202604-001",
            bill_date=date(2026, 4, 20),
            vendor=self.vendor,
            tax_mode="GST",
            finance_account=self.cash_account,
            lines=[
                {
                    "inventory_item": self.item,
                    "description": "Purchase line",
                    "quantity": Decimal("1.000"),
                    "unit_cost": Decimal("1000.00"),
                    "tax_amount": Decimal("180.00"),
                }
            ],
            performed_by=self.admin,
        )
        self.assertEqual(purchase_bill.status, PurchaseBillStatus.DRAFT)
        self.assertEqual(purchase_bill.subtotal, Decimal("1000.00"))
        self.assertEqual(purchase_bill.tax_total, Decimal("180.00"))
        self.assertEqual(purchase_bill.grand_total, Decimal("1180.00"))

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
        pb_line = PurchaseBillLine.objects.filter(purchase_bill=purchase_bill).order_by("id").first()
        self.assertIsNotNone(pb_line)
        self.assertTrue(
            StockLedger.objects.filter(
                inventory_item=self.item,
                movement_type=StockMovementType.PURCHASE_IN,
                reference_model="PurchaseBillLine",
                reference_id=f"{purchase_bill.id}:{pb_line.id}",
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
        self.assertTrue(
            VendorLedgerEntry.objects.filter(
                vendor=self.vendor,
                entry_type="PAYMENT_TO_VENDOR",
                source_type="VENDOR_SETTLEMENT",
                source_id=settlement.id,
                credit=Decimal("1180.00"),
            ).exists()
        )
        self.assertEqual(Decimal(get_vendor_outstanding(self.vendor)["outstanding"]), Decimal("0.00"))

        overpayment = VendorSettlement.objects.create(
            vendor=self.vendor,
            settlement_date=date(2026, 4, 22),
            amount=Decimal("1.00"),
            finance_account=self.cash_account,
            purchase_bill=purchase_bill,
        )
        with self.assertRaisesMessage(ValueError, "exceeds purchase bill outstanding"):
            post_vendor_settlement(vendor_settlement_id=overpayment.id, posted_by=self.admin)
