from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.reporting_service import build_profit_loss
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date


class ReportingProfitLossTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="reporting_pl_admin",
            phone="9364000002",
        )
        self.cash_account = ChartOfAccount.objects.create(
            code="PL-ASSET-001",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.sales_account = ChartOfAccount.objects.create(
            code="PL-INC-001",
            name="Sales",
            account_type=ChartOfAccountType.INCOME,
        )
        self.expense_account = ChartOfAccount.objects.create(
            code="PL-EXP-001",
            name="Office Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)

    def _post(self, lines):
        journal = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="P&L posting",
            lines=lines,
        )
        post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

    def test_profit_loss_computes_income_minus_expenses(self):
        self._post(
            [
                {
                    "chart_account": self.cash_account,
                    "debit_amount": Decimal("1000.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.sales_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("1000.00"),
                },
            ]
        )
        self._post(
            [
                {
                    "chart_account": self.expense_account,
                    "debit_amount": Decimal("250.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.cash_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("250.00"),
                },
            ]
        )

        report = build_profit_loss(
            start_date=timezone.localdate(),
            end_date=timezone.localdate(),
        )

        self.assertEqual(report["income_total"], "1000.00")
        self.assertEqual(report["expense_total"], "250.00")
        self.assertEqual(report["net_profit"], "750.00")
