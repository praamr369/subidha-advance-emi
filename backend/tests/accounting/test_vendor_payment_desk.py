"""Vendor page payment desk: bill payments, advances, applying advances — with guards."""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
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
from accounting.services.vendor_ledger_service import get_vendor_outstanding
from accounting.services.vendor_payment_desk_service import (
    advance_balance,
    apply_vendor_advance,
    build_vendor_payment_desk,
    pay_vendor_advance,
    pay_vendor_bills,
)
from accounting.services.vendor_settlement_service import purchase_bill_outstanding
from inventory.models import InventoryItem, InventoryItemType
from inventory.services.stock_service import upsert_purchase_bill_draft
from tests.helpers import create_admin_user, create_product, ensure_test_accounting_posting_prerequisites

DAY = date(2026, 4, 20)


class VendorPaymentDeskTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="vendor_desk_admin", phone="9381400001")
        ensure_test_accounting_posting_prerequisites(DAY, performed_by=self.admin)
        product = create_product(name="Desk Item", product_code="VD-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="VD-SKU-001",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("700.00"),
        )
        self.vendor = Vendor.objects.create(name="Desk Vendor", phone="8800000091")
        chart = ChartOfAccount.objects.create(code="VD-CASH-001", name="Desk Cash", account_type=ChartOfAccountType.ASSET)
        self.cash = FinanceAccount.objects.create(
            name="Desk Cash Counter", kind=FinanceAccountKind.CASH, chart_account=chart, opening_balance=Decimal("0.00")
        )

    def _bill(self, no: str, amount: str):
        bill = upsert_purchase_bill_draft(
            bill_no=no,
            bill_date=DAY,
            vendor=self.vendor,
            tax_mode="NON_GST",
            finance_account=self.cash,
            lines=[
                {
                    "inventory_item": self.item,
                    "description": "Desk line",
                    "quantity": Decimal("1.000"),
                    "unit_cost": Decimal(amount),
                    "tax_amount": Decimal("0.00"),
                }
            ],
            performed_by=self.admin,
        )
        approve_purchase_bill(purchase_bill_id=bill.id, approved_by=self.admin)
        bill, _ = post_purchase_bill_from_accounting(purchase_bill_id=bill.id, posted_by=self.admin)
        return bill

    def _outstanding(self) -> Decimal:
        return Decimal(get_vendor_outstanding(self.vendor)["outstanding"])

    def test_part_payment_posts_and_reduces_bill_outstanding(self):
        bill = self._bill("VD-B1", "1000.00")

        pay_vendor_bills(
            vendor_id=self.vendor.id,
            allocations=[{"purchase_bill_id": bill.id, "amount": "400.00"}],
            finance_account_id=self.cash.id,
            posted_by=self.admin,
            payment_date=DAY.isoformat(),
        )

        settlement = VendorSettlement.objects.get(purchase_bill=bill)
        self.assertEqual(settlement.status, "POSTED")
        self.assertIsNotNone(settlement.posted_journal_entry_id)
        self.assertEqual(purchase_bill_outstanding(bill), Decimal("600.00"))
        self.assertEqual(self._outstanding(), Decimal("600.00"))

    def test_cannot_pay_more_than_bill_outstanding(self):
        bill = self._bill("VD-B2", "1000.00")

        with self.assertRaises(ValidationError):
            pay_vendor_bills(
                vendor_id=self.vendor.id,
                allocations=[{"purchase_bill_id": bill.id, "amount": "1000.01"}],
                finance_account_id=self.cash.id,
                posted_by=self.admin,
            )
        self.assertFalse(VendorSettlement.objects.filter(vendor=self.vendor).exists())

    def test_payment_needs_a_real_account(self):
        bill = self._bill("VD-B3", "500.00")

        with self.assertRaises(ValidationError):
            pay_vendor_bills(
                vendor_id=self.vendor.id,
                allocations=[{"purchase_bill_id": bill.id, "amount": "100.00"}],
                finance_account_id=None,
                posted_by=self.admin,
            )

    def test_advance_then_bill_then_apply_clears_the_bill(self):
        pay_vendor_advance(
            vendor_id=self.vendor.id,
            amount="1500.00",
            finance_account_id=self.cash.id,
            posted_by=self.admin,
            payment_date=DAY.isoformat(),
        )
        self.assertEqual(advance_balance(self.vendor), Decimal("1500.00"))
        self.assertEqual(self._outstanding(), Decimal("-1500.00"))

        bill = self._bill("VD-B4", "1000.00")
        # Vendor is owed nothing net, so paying cash on top is refused.
        with self.assertRaises(ValidationError):
            pay_vendor_bills(
                vendor_id=self.vendor.id,
                allocations=[{"purchase_bill_id": bill.id, "amount": "1000.00"}],
                finance_account_id=self.cash.id,
                posted_by=self.admin,
            )

        apply_vendor_advance(
            vendor_id=self.vendor.id,
            allocations=[{"purchase_bill_id": bill.id, "amount": "1000.00"}],
            performed_by=self.admin,
        )

        self.assertEqual(purchase_bill_outstanding(bill), Decimal("0.00"))
        self.assertEqual(advance_balance(self.vendor), Decimal("500.00"))
        desk = build_vendor_payment_desk(self.vendor)
        self.assertEqual(desk["open_bills"], [])
        self.assertEqual(desk["advance_balance"], "500.00")

    def test_cannot_apply_more_advance_than_available(self):
        pay_vendor_advance(
            vendor_id=self.vendor.id, amount="300.00", finance_account_id=self.cash.id, posted_by=self.admin
        )
        bill = self._bill("VD-B5", "1000.00")

        with self.assertRaises(ValidationError):
            apply_vendor_advance(
                vendor_id=self.vendor.id,
                allocations=[{"purchase_bill_id": bill.id, "amount": "300.01"}],
                performed_by=self.admin,
            )
