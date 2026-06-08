from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    MoneyMovement,
    MoneyMovementStatus,
)
from accounting.services.money_movement_service import post_money_movement
from tests.helpers import create_admin_user
from tests.accounting.helpers import seed_bridge_ready_environment


class AccountingMoneyMovementPostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_movement_admin",
            phone="9340000004",
        )
        seed_bridge_ready_environment(performed_by=self.admin)
        self.cash_account = ChartOfAccount.objects.create(
            code="ACC-CASH-003",
            name="Counter Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.bank_account = ChartOfAccount.objects.create(
            code="ACC-BANK-003",
            name="Main Bank",
            account_type=ChartOfAccountType.ASSET,
        )
        self.cash_finance = FinanceAccount.objects.create(
            name="Cash Drawer",
            kind=FinanceAccountKind.CASH,
            chart_account=self.cash_account,
            opening_balance=Decimal("0.00"),
        )
        self.bank_finance = FinanceAccount.objects.create(
            name="Bank Ledger",
            kind=FinanceAccountKind.BANK,
            chart_account=self.bank_account,
            opening_balance=Decimal("0.00"),
            bank_last4="4321",
        )
        self.movement = MoneyMovement.objects.create(
            movement_date=timezone.localdate(),
            from_finance_account=self.cash_finance,
            to_finance_account=self.bank_finance,
            amount=Decimal("250.00"),
            reference_no="MOVE-001",
        )

    def test_money_movement_posting_creates_balanced_journal(self):
        posted_movement, updated = post_money_movement(
            money_movement_id=self.movement.id,
            posted_by=self.admin,
        )
        posted_movement.refresh_from_db()

        self.assertTrue(updated)
        self.assertEqual(posted_movement.status, MoneyMovementStatus.POSTED)
        self.assertIsNotNone(posted_movement.posted_journal_entry_id)
        journal_lines = list(posted_movement.posted_journal_entry.lines.order_by("id"))
        self.assertEqual(journal_lines[0].chart_account_id, self.bank_account.id)
        self.assertEqual(journal_lines[1].chart_account_id, self.cash_account.id)

        reposted_movement, reposted = post_money_movement(
            money_movement_id=self.movement.id,
            posted_by=self.admin,
        )
        self.assertFalse(reposted)
        self.assertEqual(reposted_movement.id, posted_movement.id)
