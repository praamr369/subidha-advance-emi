from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import AccountingPeriod, ChartOfAccount, ChartOfAccountType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from tests.helpers import create_admin_user


class AccountingPeriodLockTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="period_lock_admin",
            phone="9381000001",
        )
        self.debit_account = ChartOfAccount.objects.create(
            code="LOCK-ASSET-001",
            name="Lock Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        self.credit_account = ChartOfAccount.objects.create(
            code="LOCK-INCOME-001",
            name="Lock Income",
            account_type=ChartOfAccountType.INCOME,
        )

    def test_locked_period_blocks_journal_posting(self):
        entry_date = date(2026, 4, 10)
        AccountingPeriod.objects.create(
            code="FY2026-27",
            label="2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_locked=True,
            locked_by=self.admin,
        )
        journal = create_journal_entry(
            entry_date=entry_date,
            entry_type="MANUAL",
            memo="Locked period journal",
            lines=[
                {
                    "chart_account": self.debit_account,
                    "debit_amount": Decimal("200.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.credit_account,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("200.00"),
                },
            ],
        )

        with self.assertRaisesMessage(ValueError, "Accounting period FY2026-27 is locked."):
            post_journal_entry(journal_entry_id=journal.id, posted_by=self.admin)

