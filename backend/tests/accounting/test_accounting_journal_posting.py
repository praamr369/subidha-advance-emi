from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    post_journal_entry,
    void_journal_entry,
)
from tests.helpers import create_admin_user


class AccountingJournalPostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_journal_admin",
            phone="9340000001",
        )
        self.cash_account = ChartOfAccount.objects.create(
            code="ACC-CASH-001",
            name="Cash On Hand",
            account_type=ChartOfAccountType.ASSET,
        )
        self.expense_account = ChartOfAccount.objects.create(
            code="ACC-EXP-001",
            name="Admin Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )

    def test_journal_posting_requires_balanced_lines(self):
        with self.assertRaisesMessage(ValueError, "Journal entry is unbalanced."):
            create_journal_entry(
                entry_date=timezone.localdate(),
                entry_type=JournalEntryType.MANUAL,
                memo="Unbalanced test",
                lines=[
                    {
                        "chart_account": self.expense_account,
                        "debit_amount": Decimal("100.00"),
                        "credit_amount": Decimal("0.00"),
                    },
                    {
                        "chart_account": self.cash_account,
                        "debit_amount": Decimal("0.00"),
                        "credit_amount": Decimal("90.00"),
                    },
                ],
            )

    def test_journal_can_be_posted_and_voided_in_controlled_flow(self):
        journal_entry = create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Manual adjustment",
            lines=[
                {
                    "chart_account": self.expense_account,
                    "description": "Expense",
                    "debit_amount": Decimal("100.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.cash_account,
                    "description": "Cash",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("100.00"),
                },
            ],
        )

        posted_journal, updated = post_journal_entry(
            journal_entry_id=journal_entry.id,
            posted_by=self.admin,
        )

        self.assertTrue(updated)
        self.assertEqual(posted_journal.status, JournalEntryStatus.POSTED)
        self.assertEqual(posted_journal.posted_by_id, self.admin.id)
        self.assertEqual(posted_journal.approved_by_id, self.admin.id)
        self.assertEqual(posted_journal.lines.count(), 2)

        voided_journal, void_updated = void_journal_entry(
            journal_entry_id=journal_entry.id,
            performed_by=self.admin,
            reason="Incorrect manual memo",
        )

        self.assertTrue(void_updated)
        self.assertEqual(voided_journal.status, JournalEntryStatus.VOID)
        self.assertEqual(voided_journal.void_reason, "Incorrect manual memo")
