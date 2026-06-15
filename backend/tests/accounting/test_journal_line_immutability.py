"""
Tests for JournalEntryLine immutability guard.

Once a JournalEntry is POSTED or VOID, its child lines must not be
mutated or deleted at the ORM level. Corrections must go through a
reversal journal issued by the service layer.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
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
from tests.helpers import (
    create_admin_user,
    ensure_journal_numbering_profile_for_date,
    ensure_open_accounting_period_for_date,
)


class JournalLineImmutabilityTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="line_guard_admin", phone="9350000001")
        today = timezone.localdate()
        ensure_open_accounting_period_for_date(today, performed_by=self.admin)
        ensure_journal_numbering_profile_for_date(today, performed_by=self.admin)

        self.cash_account = ChartOfAccount.objects.create(
            code="LG-CASH-001",
            name="Cash Line Guard",
            account_type=ChartOfAccountType.ASSET,
        )
        self.expense_account = ChartOfAccount.objects.create(
            code="LG-EXP-001",
            name="Expense Line Guard",
            account_type=ChartOfAccountType.EXPENSE,
        )

    def _make_balanced_journal(self):
        return create_journal_entry(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.MANUAL,
            memo="Line immutability test",
            lines=[
                {
                    "chart_account": self.expense_account,
                    "description": "Debit side",
                    "debit_amount": Decimal("200.00"),
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": self.cash_account,
                    "description": "Credit side",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": Decimal("200.00"),
                },
            ],
        )

    def test_draft_journal_line_can_be_modified(self):
        """Lines of DRAFT entries are freely mutable."""
        entry = self._make_balanced_journal()
        self.assertEqual(entry.status, JournalEntryStatus.DRAFT)

        line = entry.lines.first()
        line.description = "Updated description"
        line.save()  # must not raise

        line.refresh_from_db()
        self.assertEqual(line.description, "Updated description")

    def test_posted_journal_line_cannot_be_modified(self):
        """Lines of POSTED entries are immutable."""
        entry = self._make_balanced_journal()
        posted_entry, _ = post_journal_entry(
            journal_entry_id=entry.id, posted_by=self.admin
        )
        self.assertEqual(posted_entry.status, JournalEntryStatus.POSTED)

        line = posted_entry.lines.first()
        line.description = "Mutated after posting"
        with self.assertRaises(ValidationError):
            line.save()

    def test_void_journal_line_cannot_be_modified(self):
        """Lines of VOID entries are immutable."""
        entry = self._make_balanced_journal()
        posted_entry, _ = post_journal_entry(
            journal_entry_id=entry.id, posted_by=self.admin
        )
        voided_entry, _ = void_journal_entry(
            journal_entry_id=posted_entry.id,
            reason="Test void",
            performed_by=self.admin,
        )
        self.assertEqual(voided_entry.status, JournalEntryStatus.VOID)

        line = voided_entry.lines.first()
        line.description = "Mutated after void"
        with self.assertRaises(ValidationError):
            line.save()

    def test_posting_a_draft_line_update_creates_no_side_effects(self):
        """Ensures that updating a DRAFT line description does not auto-post."""
        entry = self._make_balanced_journal()
        line = entry.lines.first()
        line.description = "Pre-post description update"
        line.save()

        entry.refresh_from_db()
        self.assertEqual(entry.status, JournalEntryStatus.DRAFT)
