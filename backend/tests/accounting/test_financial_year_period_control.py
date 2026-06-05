from datetime import date

from django.test import TestCase

from accounting.models import AccountingPeriod, AccountingPeriodStatus, FinancialYear
from accounting.services.period_service import (
    activate_financial_year,
    build_accounting_period_readiness,
    generate_monthly_periods,
    resolve_accounting_period,
    validate_posting_date,
)
from tests.helpers import create_admin_user


class FinancialYearPeriodControlTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="fy_period_admin", phone="9381200001")

    def test_create_financial_year(self):
        financial_year = FinancialYear.objects.create(
            code="fy2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )

        self.assertEqual(financial_year.code, "FY2026-27")
        self.assertFalse(financial_year.is_active)

    def test_activate_financial_year(self):
        first = FinancialYear.objects.create(
            code="FY2025-26",
            name="FY 2025-26",
            start_date=date(2025, 4, 1),
            end_date=date(2026, 3, 31),
            is_active=True,
            activated_by=self.admin,
        )
        second = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )

        activated = activate_financial_year(second.id, performed_by=self.admin)
        first.refresh_from_db()

        self.assertTrue(activated.is_active)
        self.assertFalse(first.is_active)
        self.assertEqual(activated.activated_by, self.admin)

    def test_generate_monthly_periods(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )

        result = generate_monthly_periods(financial_year.id, performed_by=self.admin)

        self.assertEqual(result["created_count"], 12)
        self.assertEqual(AccountingPeriod.objects.filter(financial_year=financial_year).count(), 12)
        self.assertTrue(
            AccountingPeriod.objects.filter(
                financial_year=financial_year,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 4, 30),
            ).exists()
        )

    def test_resolve_period_by_date(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
            activated_by=self.admin,
        )
        generate_monthly_periods(financial_year.id, performed_by=self.admin)

        period = resolve_accounting_period(date(2026, 4, 15))

        self.assertEqual(period.start_date, date(2026, 4, 1))
        self.assertEqual(period.financial_year, financial_year)

    def test_validation_rejects_locked_period(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
            activated_by=self.admin,
        )
        period = AccountingPeriod.objects.create(
            code="FY2026-27-APR",
            label="April 2026",
            name="April 2026",
            financial_year=financial_year,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            status=AccountingPeriodStatus.LOCKED,
            locked_by=self.admin,
        )

        with self.assertRaisesMessage(ValueError, f"Accounting period {period.code} is locked."):
            validate_posting_date(date(2026, 4, 15))

    def test_validation_rejects_closed_period(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
            activated_by=self.admin,
        )
        period = AccountingPeriod.objects.create(
            code="FY2026-27-APR",
            label="April 2026",
            name="April 2026",
            financial_year=financial_year,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            status=AccountingPeriodStatus.CLOSED,
            locked_by=self.admin,
        )

        with self.assertRaisesMessage(ValueError, f"Accounting period {period.code} is closed."):
            validate_posting_date(date(2026, 4, 15))

    def test_readiness_errors_when_setup_missing(self):
        readiness = build_accounting_period_readiness(reference_date=date(2026, 4, 15))

        self.assertFalse(readiness["is_ready"])
        self.assertIn("No active financial year is configured.", readiness["errors"])
