"""P4-RC-C regression tests for Playwright smoke accounting prerequisites."""
from __future__ import annotations

from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import User, UserRole
from accounting.models import (
    AccountingPeriod,
    AccountingPeriodStatus,
    DocumentSequence,
    FinancialYear,
    JournalEntry,
    JournalEntryStatus,
)
from accounting.services.document_sequence_service import DocumentType
from accounting.services.period_service import validate_posting_date
from subscriptions.management.commands.seed_playwright_smoke import Command as SeedCommand
from subscriptions.models import Payment


class PlaywrightSeedFinancialYearPeriodTests(TestCase):
    reference_date = date(2026, 6, 18)

    def setUp(self):
        self.admin = User.objects.create_user(
            username="p4rcc-admin",
            password="AdminPass123!",
            phone="9790000001",
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.command = SeedCommand()

    def _ensure(self):
        return self.command._ensure_smoke_accounting_context(
            reference_dates=(self.reference_date,),
            performed_by=self.admin,
        )

    def test_seed_creates_active_financial_year_for_smoke_payment_date(self):
        result = self._ensure()

        financial_year = result["financial_year"]
        self.assertTrue(financial_year.is_active)
        self.assertLessEqual(financial_year.start_date, self.reference_date)
        self.assertGreaterEqual(financial_year.end_date, self.reference_date)

    def test_seed_creates_open_accounting_period_for_smoke_payment_date(self):
        result = self._ensure()

        period = result["periods"][0]
        self.assertEqual(period.status, AccountingPeriodStatus.OPEN)
        self.assertFalse(period.is_locked)
        self.assertLessEqual(period.start_date, self.reference_date)
        self.assertGreaterEqual(period.end_date, self.reference_date)
        self.assertEqual(period.financial_year_id, result["financial_year"].id)
        self.assertEqual(validate_posting_date(self.reference_date).id, period.id)

    def test_seed_creates_journal_numbering_required_by_payment_posting(self):
        result = self._ensure()

        sequence = result["journal_sequence"]
        self.assertEqual(sequence.document_type, DocumentType.JOURNAL_ENTRY)
        self.assertTrue(sequence.is_active)
        self.assertEqual(sequence.financial_year_ref_id, result["financial_year"].id)

    def test_second_seed_run_does_not_duplicate_year_period_or_sequence(self):
        first = self._ensure()
        second = self._ensure()

        self.assertEqual(first["financial_year"].id, second["financial_year"].id)
        self.assertEqual(first["periods"][0].id, second["periods"][0].id)
        self.assertEqual(first["journal_sequence"].id, second["journal_sequence"].id)
        self.assertEqual(FinancialYear.objects.filter(is_active=True).count(), 1)
        self.assertEqual(
            AccountingPeriod.objects.filter(
                start_date__lte=self.reference_date,
                end_date__gte=self.reference_date,
            ).count(),
            1,
        )
        self.assertEqual(
            DocumentSequence.objects.filter(
                document_type=DocumentType.JOURNAL_ENTRY,
                is_active=True,
            ).count(),
            1,
        )

    def test_existing_valid_active_year_and_period_are_reused(self):
        first = self._ensure()
        second = self._ensure()

        self.assertEqual(first["financial_year"].pk, second["financial_year"].pk)
        self.assertEqual(first["periods"][0].pk, second["periods"][0].pk)

    def test_smoke_payment_dates_do_not_cross_april_financial_year_boundary(self):
        paid_date, cashier_date = self.command._smoke_payment_dates(date(2026, 4, 2))

        self.assertEqual(paid_date, date(2026, 4, 1))
        self.assertEqual(cashier_date, date(2026, 4, 1))

    def test_existing_locked_period_is_not_reopened(self):
        result = self._ensure()
        period = result["periods"][0]
        period.status = AccountingPeriodStatus.LOCKED
        period.is_locked = True
        period.save(update_fields=["status", "is_locked", "updated_at"])

        with self.assertRaisesMessage(ValueError, "is locked"):
            self._ensure()

        period.refresh_from_db()
        self.assertEqual(period.status, AccountingPeriodStatus.LOCKED)
        self.assertTrue(period.is_locked)

    def test_full_seed_posts_payments_without_accounting_period_error(self):
        with TemporaryDirectory() as temp_dir:
            meta_path = Path(temp_dir) / "playwright-smoke-meta.json"
            with override_settings(PLAYWRIGHT_SMOKE_META_PATH=meta_path):
                call_command("seed_playwright_smoke")

        self.assertTrue(Payment.objects.filter(reference_no="SMOKE-PAID-001").exists())
        self.assertTrue(Payment.objects.filter(reference_no="SMOKE-CASH-001").exists())
        self.assertEqual(
            JournalEntry.objects.filter(status=JournalEntryStatus.POSTED).count(),
            2,
        )
