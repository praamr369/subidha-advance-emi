from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import AccountingPeriod, ChartOfAccount, ChartOfAccountType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from accounting.services.period_service import create_posting_lock
from tests.helpers import create_admin_user


class AccountingPeriodCloseAndPostingLockTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="period_close_admin", phone="9381100001")
        self.debit_account = ChartOfAccount.objects.create(
            code="PCLOSE-ASSET-001",
            name="Period Close Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        self.credit_account = ChartOfAccount.objects.create(
            code="PCLOSE-INCOME-001",
            name="Period Close Income",
            account_type=ChartOfAccountType.INCOME,
        )

    def _draft_journal(self, entry_date: date):
        return create_journal_entry(
            entry_date=entry_date,
            entry_type="MANUAL",
            memo="Phase3 period test",
            lines=[
                {"chart_account": self.debit_account, "debit_amount": Decimal("100.00"), "credit_amount": Decimal("0.00")},
                {"chart_account": self.credit_account, "debit_amount": Decimal("0.00"), "credit_amount": Decimal("100.00")},
            ],
        )

    def test_closed_period_blocks_posting(self):
        entry_date = date(2026, 4, 18)
        AccountingPeriod.objects.create(
            code="FY2026-27",
            label="2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_locked=True,
            locked_by=self.admin,
        )
        journal = self._draft_journal(entry_date)

        with self.assertRaisesMessage(ValueError, "Accounting period FY2026-27 is locked."):
            post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

    def test_posting_lock_blocks_single_day_posting(self):
        entry_date = date(2026, 4, 19)
        journal = self._draft_journal(entry_date)
        create_posting_lock(
            lock_date=entry_date,
            performed_by=self.admin,
            reason="Close day freeze",
        )

        with self.assertRaisesMessage(ValueError, f"Accounting posting lock exists for {entry_date.isoformat()}."):
            post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

