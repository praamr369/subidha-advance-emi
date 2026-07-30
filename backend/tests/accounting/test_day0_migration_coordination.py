"""Day-0 migration coordination proof.

Seeds every opening type (cash, bank, vendor payable, customer receivable,
opening stock) and asserts they coordinate into one consistent set of books:
posted journals balance, the integrity service ties them together, and the
inventory ledger carries the stock valuation.
"""
from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    Vendor,
)
from accounting.services.opening_balance_migration_service import (
    create_customer_opening_outstanding,
    set_finance_account_opening_balance,
    set_vendor_opening_balance,
)
from accounting.services.opening_balance_integrity_service import build_opening_balance_integrity
from inventory.models import InventoryItem, StockLocation
from inventory.services.opening_stock_entry_service import (
    create_opening_stock_entry,
    post_opening_stock_entry,
)
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_product


class Day0MigrationCoordinationTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="day0_admin", phone="9107000001")
        env = seed_bridge_ready_environment(performed_by=self.admin)
        self.cash = env["finance_accounts"]["CASH"]
        self.bank = env["finance_accounts"]["BANK"]
        self.today = date.today()

    def _posted_opening_totals(self):
        lines = JournalEntryLine.objects.filter(
            journal_entry__status=JournalEntryStatus.POSTED,
            journal_entry__source_type="OPENING_BALANCE_MIGRATION",
        )
        debit = sum((l.debit_amount for l in lines), Decimal("0.00"))
        credit = sum((l.credit_amount for l in lines), Decimal("0.00"))
        return debit, credit

    def test_all_monetary_openings_coordinate_into_balanced_books(self):
        # 1. Cash opening balance.
        set_finance_account_opening_balance(
            finance_account=self.cash, amount=Decimal("50000.00"), entry_date=self.today, actor=self.admin
        )
        # 2. Bank opening balance.
        set_finance_account_opening_balance(
            finance_account=self.bank, amount=Decimal("200000.00"), entry_date=self.today, actor=self.admin
        )
        # 3. Vendor opening payable.
        vendor = Vendor.objects.create(name="Old Supplier", vendor_code="V-OLD-1")
        set_vendor_opening_balance(
            vendor=vendor, amount=Decimal("30000.00"), entry_date=self.today, notes="carried over", actor=self.admin
        )
        # 4. Customer old outstanding.
        create_customer_opening_outstanding(
            customer_name="Old Buyer", phone="9998887771", amount=Decimal("15000.00"),
            entry_date=self.today, notes="legacy", actor=self.admin,
        )

        # Every opening journal is POSTED and the aggregate ties out (debit == credit).
        debit, credit = self._posted_opening_totals()
        self.assertEqual(debit, credit, "Opening journals must net to a zero trial-balance difference.")
        self.assertGreater(debit, Decimal("0.00"))

        # The integrity service reflects the same coordinated picture from the DB.
        integrity = build_opening_balance_integrity()
        self.assertTrue(integrity["trial_balance"]["is_balanced"])
        self.assertEqual(integrity["trial_balance"]["non_posted_journal_count"], 0)
        self.assertEqual(integrity["finance_accounts"]["with_opening_balance"], 2)
        self.assertEqual(integrity["finance_accounts"]["missing_opening_journal"], 0)
        self.assertEqual(integrity["customer_receivables"]["total"], 1)
        self.assertEqual(integrity["customer_receivables"]["missing_opening_journal"], 0)
        self.assertEqual(integrity["vendor_payables"]["vendors_with_opening"], 1)
        self.assertEqual(integrity["vendor_payables"]["opening_payable_net"], "30000.00")

        # Cross-check specific control accounts received the right legs.
        ar = ChartOfAccount.objects.get(system_code="CUSTOMER_RECEIVABLE")
        ap = ChartOfAccount.objects.get(system_code="ACCOUNTS_PAYABLE")
        ar_debit = sum(
            (l.debit_amount for l in JournalEntryLine.objects.filter(
                chart_account=ar, journal_entry__source_type="OPENING_BALANCE_MIGRATION",
                journal_entry__status=JournalEntryStatus.POSTED)),
            Decimal("0.00"),
        )
        ap_credit = sum(
            (l.credit_amount for l in JournalEntryLine.objects.filter(
                chart_account=ap, journal_entry__source_type="OPENING_BALANCE_MIGRATION",
                journal_entry__status=JournalEntryStatus.POSTED)),
            Decimal("0.00"),
        )
        self.assertEqual(ar_debit, Decimal("15000.00"))
        self.assertEqual(ap_credit, Decimal("30000.00"))

    def test_opening_stock_posts_to_general_ledger_and_coordinates(self):
        # Seed one inventory item + location, then post opening stock with a real cost.
        product = create_product(name="Day0 Chair", product_code="D0-CHAIR-1", base_price=Decimal("2000.00"))
        item = InventoryItem.objects.create(
            product=product, sku="D0-CHAIR-1", unit_of_measure="PCS",
            opening_stock_qty=Decimal("0.000"), reorder_level_qty=Decimal("1.000"),
        )
        location = StockLocation.objects.create(code="MAIN", name="Main Store")
        entry = create_opening_stock_entry(
            inventory_item_id=item.id, stock_location_id=location.id,
            quantity=Decimal("10.000"), effective_date=self.today,
            unit_cost_snapshot=Decimal("1500.00"), created_by=self.admin,
        )
        post_opening_stock_entry(entry_id=entry.id, posted_by=self.admin)

        # Inventory Asset must be debited by the valuation (10 * 1500 = 15000).
        inv = ChartOfAccount.objects.get(system_code="INVENTORY_ASSET")
        inv_debit = sum(
            (l.debit_amount for l in JournalEntryLine.objects.filter(
                chart_account=inv, journal_entry__source_type="OPENING_BALANCE_MIGRATION",
                journal_entry__status=JournalEntryStatus.POSTED)),
            Decimal("0.00"),
        )
        self.assertEqual(inv_debit, Decimal("15000.00"))

        # The opening journals (now including inventory) still tie out.
        debit, credit = self._posted_opening_totals()
        self.assertEqual(debit, credit)

        integrity = build_opening_balance_integrity()
        self.assertEqual(integrity["opening_stock"]["posted_entries"], 1)
        self.assertEqual(integrity["opening_stock"]["total_valuation"], "15000.00")
        self.assertEqual(integrity["opening_stock"]["missing_gl_journal"], 0)
        self.assertTrue(integrity["trial_balance"]["is_balanced"])
