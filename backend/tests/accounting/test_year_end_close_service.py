from __future__ import annotations

from calendar import monthrange
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import AccountingPeriod, AccountingPeriodStatus, DocumentSequence, FinancialYear, JournalEntry
from accounting.services.year_end_close_service import YearEndCloseCommand, build_year_end_close_readiness, execute_year_end_close
from backend.tests.helpers import create_admin_user, create_customer_user


def _month_starts(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current = current.replace(year=current.year + 1, month=1, day=1) if current.month == 12 else current.replace(month=current.month + 1, day=1)


def _make_financial_year(*, code="FY2026-27", is_active=True):
    return FinancialYear.objects.create(
        code=code,
        name="FY 2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_active=is_active,
    )


def _make_periods(financial_year: FinancialYear, *, status=AccountingPeriodStatus.LOCKED):
    periods = []
    for current in _month_starts(financial_year.start_date, financial_year.end_date):
        period_end = date(current.year, current.month, monthrange(current.year, current.month)[1])
        periods.append(
            AccountingPeriod.objects.create(
                financial_year=financial_year,
                code=f"{financial_year.code}-{current.year}{current.month:02d}",
                label=current.strftime("%B %Y"),
                name=current.strftime("%B %Y"),
                start_date=current,
                end_date=min(period_end, financial_year.end_date),
                status=status,
                is_locked=status != AccountingPeriodStatus.OPEN,
            )
        )
    return periods


def _make_journal_numbering(financial_year: FinancialYear):
    return DocumentSequence.objects.create(
        series_code="JOURNAL",
        document_type="JOURNAL_ENTRY",
        financial_year=financial_year.code,
        financial_year_ref=financial_year,
        prefix="JE",
        padding=5,
        next_number=1,
        is_active=True,
    )


class YearEndCloseReadinessTests(TestCase):
    def test_readiness_blocked_when_no_financial_year_exists(self):
        payload = build_year_end_close_readiness()
        self.assertFalse(payload["ready_to_close"])
        self.assertEqual(payload["blocking_items"][0]["code"], "NO_FINANCIAL_YEAR")

    @patch("accounting.services.year_end_close_service._bridge_counts", return_value=(0, 0))
    def test_readiness_blocked_when_period_is_open(self, _bridge_counts):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.OPEN)
        _make_journal_numbering(financial_year)
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertFalse(payload["ready_to_close"])
        self.assertIn("OPEN_PERIODS", {item["code"] for item in payload["blocking_items"]})

    @patch("accounting.services.year_end_close_service._bridge_counts", return_value=(0, 0))
    def test_readiness_passes_when_periods_locked_and_clean(self, _bridge_counts):
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        payload = build_year_end_close_readiness(financial_year.id)
        self.assertTrue(payload["ready_to_close"])
        self.assertEqual(payload["open_period_count"], 0)
        self.assertEqual(payload["unposted_bridge_item_count"], 0)

    @patch("accounting.services.year_end_close_service._bridge_counts", return_value=(0, 0))
    def test_close_requires_confirmation_text(self, _bridge_counts):
        admin = create_admin_user(username="year_close_admin_confirm")
        financial_year = _make_financial_year()
        _make_periods(financial_year, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(financial_year)
        with self.assertRaises(ValueError):
            execute_year_end_close(
                YearEndCloseCommand(financial_year=financial_year.id, confirmation_text="WRONG", acknowledge_warnings=True),
                performed_by=admin,
            )

    @patch("accounting.services.year_end_close_service._bridge_counts", return_value=(0, 0))
    def test_close_closes_only_selected_financial_year_periods_and_is_idempotent(self, _bridge_counts):
        admin = create_admin_user(username="year_close_admin_execute")
        selected = _make_financial_year(code="FY2026-27", is_active=True)
        other = _make_financial_year(code="FY2027-28", is_active=False)
        _make_periods(selected, status=AccountingPeriodStatus.LOCKED)
        _make_periods(other, status=AccountingPeriodStatus.LOCKED)
        _make_journal_numbering(selected)
        before_journals = JournalEntry.objects.count()

        result = execute_year_end_close(
            YearEndCloseCommand(financial_year=selected.id, confirmation_text="CLOSE FY2026-27", acknowledge_warnings=True),
            performed_by=admin,
        )
        self.assertTrue(result["updated"])
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=selected, status=AccountingPeriodStatus.CLOSED).count(), 12)
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=other, status=AccountingPeriodStatus.LOCKED).count(), 12)
        self.assertEqual(JournalEntry.objects.count(), before_journals)

        second = execute_year_end_close(
            YearEndCloseCommand(financial_year=selected.id, confirmation_text="CLOSE FY2026-27", acknowledge_warnings=True),
            performed_by=admin,
        )
        self.assertFalse(second["updated"])
        self.assertTrue(second["already_closed"])


class YearEndCloseApiTests(TestCase):
    def test_close_requires_admin_user(self):
        client = APIClient()
        user = create_customer_user(username="year_close_customer")
        client.force_authenticate(user=user)
        response = client.post(
            "/api/v1/accounting/year-end/close/",
            {"financial_year": "FY2026-27", "confirmation_text": "CLOSE FY2026-27"},
            format="json",
        )
        self.assertIn(response.status_code, {401, 403})

    def test_readiness_endpoint_does_not_create_journals_or_document_numbers(self):
        admin = create_admin_user(username="year_close_admin_readonly")
        client = APIClient()
        client.force_authenticate(user=admin)
        before_journals = JournalEntry.objects.count()
        before_sequences = DocumentSequence.objects.count()
        response = client.get("/api/v1/accounting/year-end/readiness/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(DocumentSequence.objects.count(), before_sequences)
