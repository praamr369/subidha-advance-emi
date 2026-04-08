from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import SalarySheetStatus
from accounting.services.salary_posting_service import (
    approve_salary_sheet,
    post_salary_sheet,
)
from tests.helpers import create_admin_user
from accounting.models import EmployeeProfile, ChartOfAccount


class AccountingSalaryPostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_salary_admin",
            phone="9340000003",
        )
        self.employee = EmployeeProfile.objects.create(
            employee_code="EMP-SAL-001",
            name="Salary Employee",
            joining_date=timezone.localdate(),
            base_salary=Decimal("1500.00"),
        )
        self.salary_sheet = self.employee.salary_sheets.create(
            year=timezone.localdate().year,
            month=timezone.localdate().month,
            gross_amount=Decimal("1500.00"),
            deductions_amount=Decimal("200.00"),
            net_amount=Decimal("1300.00"),
        )

    def test_salary_sheet_approval_and_posting_create_system_accounts(self):
        approved_sheet, approved = approve_salary_sheet(
            salary_sheet_id=self.salary_sheet.id,
            approved_by=self.admin,
        )
        self.assertTrue(approved)
        self.assertEqual(approved_sheet.status, SalarySheetStatus.APPROVED)

        posted_sheet, posted = post_salary_sheet(
            salary_sheet_id=self.salary_sheet.id,
            posted_by=self.admin,
        )
        posted_sheet.refresh_from_db()

        self.assertTrue(posted)
        self.assertEqual(posted_sheet.status, SalarySheetStatus.POSTED)
        self.assertIsNotNone(posted_sheet.posted_journal_entry_id)
        self.assertEqual(posted_sheet.posted_journal_entry.lines.count(), 2)
        self.assertTrue(
            ChartOfAccount.objects.filter(system_code="SALARY_EXPENSE").exists()
        )
        self.assertTrue(
            ChartOfAccount.objects.filter(system_code="SALARY_PAYABLE").exists()
        )
