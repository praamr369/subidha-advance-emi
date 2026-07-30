from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    CustomerOpeningOutstanding,
    FinanceAccount,
    FinanceAccountKind,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    LegacyReceivableCollection,
)
from accounting.services.legacy_receivable_service import settle_legacy_receivable
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, ensure_test_collection_purpose_mapping


class LegacyReceivableCollectionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="legacy_rcv_admin", phone="9105000001")
        seed_bridge_ready_environment(performed_by=self.admin)
        self.cash = FinanceAccount.objects.create(
            name="Legacy Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="LGC-CASH-001", name="Legacy Cash Chart", account_type=ChartOfAccountType.ASSET
            ),
            opening_balance=Decimal("0.00"),
        )
        ensure_test_collection_purpose_mapping(finance_account=self.cash)
        self.receivable = CustomerOpeningOutstanding.objects.create(
            customer_name="Old Customer",
            phone="9998887770",
            outstanding_amount=Decimal("1000.00"),
            entry_date=date.today(),
            created_by=self.admin,
        )

    def _ar_chart(self):
        return ChartOfAccount.objects.filter(system_code="CUSTOMER_RECEIVABLE", is_active=True).first()

    def test_partial_then_full_collection_posts_ledger_and_settles(self):
        # First partial payment of 400.
        result = settle_legacy_receivable(
            receivable_id=self.receivable.id,
            amount=Decimal("400.00"),
            payment_method="CASH",
            finance_account_id=self.cash.id,
            performed_by=self.admin,
        )
        self.receivable.refresh_from_db()
        self.assertFalse(self.receivable.is_settled)
        self.assertEqual(self.receivable.collected_amount, Decimal("400.00"))
        self.assertEqual(self.receivable.balance_remaining, Decimal("600.00"))

        # A posted journal must move cash (debit) and clear AR (credit).
        journal = JournalEntry.objects.get(id=result["journal_entry_id"])
        self.assertEqual(journal.status, JournalEntryStatus.POSTED)
        cash_line = JournalEntryLine.objects.get(journal_entry=journal, chart_account=self.cash.chart_account)
        ar_line = JournalEntryLine.objects.get(journal_entry=journal, chart_account=self._ar_chart())
        self.assertEqual(cash_line.debit_amount, Decimal("400.00"))
        self.assertEqual(ar_line.credit_amount, Decimal("400.00"))

        # Second payment settles the remaining 600.
        settle_legacy_receivable(
            receivable_id=self.receivable.id,
            amount=Decimal("600.00"),
            payment_method="CASH",
            finance_account_id=self.cash.id,
            performed_by=self.admin,
        )
        self.receivable.refresh_from_db()
        self.assertTrue(self.receivable.is_settled)
        self.assertIsNotNone(self.receivable.settled_at)
        self.assertEqual(self.receivable.balance_remaining, Decimal("0.00"))
        self.assertEqual(LegacyReceivableCollection.objects.filter(receivable=self.receivable).count(), 2)

    def test_overpayment_is_rejected(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            settle_legacy_receivable(
                receivable_id=self.receivable.id,
                amount=Decimal("1500.00"),
                payment_method="CASH",
                finance_account_id=self.cash.id,
                performed_by=self.admin,
            )
        self.receivable.refresh_from_db()
        self.assertFalse(self.receivable.is_settled)
        self.assertEqual(self.receivable.collected_amount, Decimal("0.00"))
