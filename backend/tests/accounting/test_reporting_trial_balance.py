from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import ChartOfAccount, ChartOfAccountType, JournalEntryType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.reporting_service import build_trial_balance
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date


class ReportingTrialBalanceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="reporting_tb_admin",
            phone="9364000001",
        )
        self.cash_account = ChartOfAccount.objects.create(
            code="TB-ASSET-001",
            name="Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.capital_account = ChartOfAccount.objects.create(
            code="TB-EQ-001",
            name="Owner Capital",
            account_type=ChartOfAccountType.EQUITY,
        )
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)

    def test_trial_balance_rolls_up_posted_journal_lines(self):
        journal = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Capital introduced",
            lines=[
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
            ],
        )
        post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

        report = build_trial_balance(
            start_date=timezone.localdate(),
            end_date=timezone.localdate(),
        )

        self.assertTrue(report["balanced"])
        self.assertEqual(report["total_debits"], "500.00")
        self.assertEqual(report["total_credits"], "500.00")
        self.assertEqual(len(report["rows"]), 2)
