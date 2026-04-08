from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.reporting_service import build_balance_sheet
from tests.helpers import create_admin_user


class ReportingBalanceSheetTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="reporting_bs_admin",
            phone="9364000003",
        )
        self.cash_account = ChartOfAccount.objects.create(
            code="BS-ASSET-001",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.capital_account = ChartOfAccount.objects.create(
            code="BS-EQ-001",
            name="Capital",
            account_type=ChartOfAccountType.EQUITY,
        )
        self.sales_account = ChartOfAccount.objects.create(
            code="BS-INC-001",
            name="Sales",
            account_type=ChartOfAccountType.INCOME,
        )

    def _post(self, lines):
        journal = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Balance sheet posting",
            lines=lines,
        )
        post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

    def test_balance_sheet_includes_current_period_net_income_in_equity(self):
        self._post(
            [
                {
                    "chart_account": self.cash_account,
                    "debit_amount": Decimal("500.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.capital_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("500.00"),
                },
            ]
        )
        self._post(
            [
                {
                    "chart_account": self.cash_account,
                    "debit_amount": Decimal("300.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.sales_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("300.00"),
                },
            ]
        )

        report = build_balance_sheet(as_of=timezone.localdate())

        self.assertTrue(report["balanced"])
        self.assertEqual(report["total_assets"], "800.00")
        self.assertEqual(report["total_equity"], "800.00")
        self.assertTrue(
            any(row["account_code"] == "NET-INCOME" for row in report["equity"])
        )
