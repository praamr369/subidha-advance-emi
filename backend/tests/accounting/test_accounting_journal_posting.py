from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import (
    AccountingPeriod,
    AccountingPeriodStatus,
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    FinancialYear,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    post_journal_entry,
    void_journal_entry,
)
from tests.helpers import create_admin_user, ensure_journal_numbering_profile_for_date, ensure_open_accounting_period_for_date


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
        ensure_journal_numbering_profile_for_date(timezone.localdate(), performed_by=self.admin)

    def _balanced_journal(self, entry_date=None):
        return create_journal_entry(
            entry_date=entry_date or timezone.localdate(),
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
        journal_entry = self._balanced_journal()

        posted_journal, updated = post_journal_entry(
            journal_entry_id=journal_entry.id,
            posted_by=self.admin,
        )

        self.assertTrue(updated)
        self.assertEqual(posted_journal.status, JournalEntryStatus.POSTED)
        self.assertTrue(posted_journal.entry_no.startswith("JV/FY"))
        self.assertIsNotNone(posted_journal.financial_year_id)
        self.assertIsNotNone(posted_journal.accounting_period_id)
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

    def test_journal_posting_resolves_open_period_and_allocates_number(self):
        entry_date = date(2026, 6, 10)
        financial_year, period = ensure_open_accounting_period_for_date(entry_date, performed_by=self.admin)
        ensure_journal_numbering_profile_for_date(entry_date, performed_by=self.admin)
        journal_entry = self._balanced_journal(entry_date)
        draft_number = journal_entry.entry_no

        posted_journal, updated = post_journal_entry(journal_entry_id=journal_entry.id, posted_by=self.admin)

        self.assertTrue(updated)
        self.assertNotEqual(posted_journal.entry_no, draft_number)
        self.assertTrue(posted_journal.entry_no.startswith("JV/FY2026-27/"))
        self.assertEqual(posted_journal.financial_year_id, financial_year.id)
        self.assertEqual(posted_journal.accounting_period_id, period.id)

    def test_missing_accounting_period_rejects_posting(self):
        entry_date = date(2026, 7, 10)
        financial_year, _ = FinancialYear.objects.update_or_create(
            code="FY2026-27",
            defaults={
                "name": "FY 2026-27",
                "start_date": date(2026, 4, 1),
                "end_date": date(2027, 3, 31),
                "is_active": True,
                "activated_by": self.admin,
            },
        )
        FinancialYear.objects.filter(is_active=True).exclude(pk=financial_year.pk).update(is_active=False)
        AccountingPeriod.objects.filter(start_date__lte=entry_date, end_date__gte=entry_date).delete()
        journal_entry = self._balanced_journal(entry_date)

        with self.assertRaisesMessage(ValueError, "No accounting period is configured for posting date 2026-07-10."):
            post_journal_entry(journal_entry_id=journal_entry.id, posted_by=self.admin)

    def test_missing_journal_numbering_profile_blocks_posting(self):
        entry_date = date(2026, 8, 10)
        ensure_open_accounting_period_for_date(entry_date, performed_by=self.admin)
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        journal_entry = self._balanced_journal(entry_date)

        with self.assertRaisesMessage(ValueError, "No numbering profile is configured"):
            post_journal_entry(journal_entry_id=journal_entry.id, posted_by=self.admin)

    def test_existing_posted_journal_number_is_preserved(self):
        journal_entry = self._balanced_journal()
        posted_journal, updated = post_journal_entry(journal_entry_id=journal_entry.id, posted_by=self.admin)
        entry_no = posted_journal.entry_no

        posted_again, updated_again = post_journal_entry(journal_entry_id=journal_entry.id, posted_by=self.admin)

        self.assertFalse(updated_again)
        self.assertEqual(posted_again.entry_no, entry_no)

    def test_readiness_checks_do_not_create_journal_entries(self):
        from accounting.services.period_service import build_accounting_period_readiness

        before = JournalEntry.objects.count()
        readiness = build_accounting_period_readiness(reference_date=timezone.localdate())

        self.assertTrue(readiness["is_ready"])
        self.assertEqual(JournalEntry.objects.count(), before)
