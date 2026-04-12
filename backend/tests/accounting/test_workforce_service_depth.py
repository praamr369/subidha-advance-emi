from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    EmployeeCompensationComponent,
    EmployeeProfile,
    ExpenseClaimStatus,
    FinanceAccount,
    FinanceAccountKind,
    LeaveType,
    SalarySheetStatus,
)
from accounting.services.salary_posting_service import (
    approve_salary_sheet,
    post_salary_sheet,
)
from accounting.services.workforce_service import (
    approve_employee_expense_claim,
    approve_leave_request,
    build_staff_ledger,
    close_payroll_period,
    get_or_create_payroll_period,
    post_employee_expense_claim,
    post_employee_expense_claim_payment,
    upsert_employee_attendance,
    upsert_employee_expense_claim_draft,
    upsert_leave_request_draft,
    upsert_salary_sheet_draft,
)
from tests.helpers import create_admin_user


class WorkforceServiceDepthTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="workforce_depth_admin",
            phone="9368000001",
        )
        expense_chart = ChartOfAccount.objects.create(
            code="WF-EXP-001",
            name="Employee Travel Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )
        cash_chart = ChartOfAccount.objects.create(
            code="WF-CASH-001",
            name="Staff Cash Drawer",
            account_type=ChartOfAccountType.ASSET,
        )
        self.expense_account = expense_chart
        self.finance_account = FinanceAccount.objects.create(
            name="Staff Cash",
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
        )

    def test_auto_generated_salary_sheet_uses_components_overtime_and_unpaid_leave(self):
        employee = EmployeeProfile.objects.create(
            employee_code="EMP-WF-001",
            name="Payroll Depth Employee",
            joining_date=date(2026, 4, 1),
            base_salary=Decimal("1500.00"),
            standard_daily_hours=Decimal("8.00"),
        )
        EmployeeCompensationComponent.objects.create(
            employee=employee,
            component_name="Travel Allowance",
            component_type="EARNING",
            amount=Decimal("200.00"),
            sort_order=1,
        )
        leave_type = LeaveType.objects.create(
            code="UNPAID",
            name="Unpaid Leave",
            is_paid=False,
        )
        leave_request = upsert_leave_request_draft(
            payload={
                "employee": employee,
                "leave_type": leave_type,
                "start_date": date(2026, 4, 15),
                "end_date": date(2026, 4, 15),
                "day_count": Decimal("1.0"),
                "reason": "Personal leave",
            },
            performed_by=self.admin,
        )
        approve_leave_request(leave_request_id=leave_request.id, approved_by=self.admin)
        upsert_employee_attendance(
            employee=employee,
            attendance_date=date(2026, 4, 10),
            status="PRESENT",
            worked_hours=Decimal("8.00"),
            overtime_hours=Decimal("2.00"),
            notes="Late customer delivery support",
            recorded_by=self.admin,
        )

        salary_sheet = upsert_salary_sheet_draft(
            payload={
                "employee": employee,
                "year": 2026,
                "month": 4,
                "gross_amount": Decimal("0.00"),
                "deductions_amount": Decimal("0.00"),
                "net_amount": Decimal("0.00"),
                "auto_generate": True,
            },
            performed_by=self.admin,
        )

        self.assertEqual(salary_sheet.status, SalarySheetStatus.DRAFT)
        self.assertEqual(salary_sheet.gross_amount, Decimal("1712.50"))
        self.assertEqual(salary_sheet.deductions_amount, Decimal("50.00"))
        self.assertEqual(salary_sheet.net_amount, Decimal("1662.50"))
        self.assertEqual(
            list(salary_sheet.lines.values_list("component_name", flat=True)),
            [
                "Base Salary",
                "Travel Allowance",
                "Overtime",
                "Unpaid Leave Deduction",
            ],
        )

        approve_salary_sheet(salary_sheet_id=salary_sheet.id, approved_by=self.admin)
        posted_sheet, posted = post_salary_sheet(
            salary_sheet_id=salary_sheet.id,
            posted_by=self.admin,
        )
        self.assertTrue(posted)
        self.assertEqual(posted_sheet.posted_journal_entry.lines.count(), 3)

        line_totals = {
            line.chart_account.system_code: (
                line.debit_amount,
                line.credit_amount,
            )
            for line in posted_sheet.posted_journal_entry.lines.select_related("chart_account")
        }
        self.assertEqual(line_totals["SALARY_EXPENSE"][0], Decimal("1712.50"))
        self.assertEqual(line_totals["SALARY_PAYABLE"][1], Decimal("1662.50"))
        self.assertEqual(
            line_totals["PAYROLL_DEDUCTIONS_CLEARING"][1],
            Decimal("50.00"),
        )

    def test_closed_payroll_period_blocks_attendance_leave_claim_and_salary_draft(self):
        employee = EmployeeProfile.objects.create(
            employee_code="EMP-WF-LOCK-001",
            name="Payroll Locked Employee",
            joining_date=date(2026, 5, 1),
            base_salary=Decimal("1000.00"),
        )
        leave_type = LeaveType.objects.create(
            code="LOCK",
            name="Locked Leave",
            is_paid=True,
        )
        payroll_period = get_or_create_payroll_period(year=2026, month=5)
        close_payroll_period(
            payroll_period_id=payroll_period.id,
            close_reason="Month finalised",
            closed_by=self.admin,
        )

        with self.assertRaisesMessage(
            ValueError,
            "Payroll period is closed for the selected date.",
        ):
            upsert_employee_attendance(
                employee=employee,
                attendance_date=date(2026, 5, 2),
                status="PRESENT",
                worked_hours=Decimal("8.00"),
                overtime_hours=Decimal("0.00"),
                recorded_by=self.admin,
            )

        with self.assertRaisesMessage(
            ValueError,
            "Payroll period is closed for one or more dates in the selected range.",
        ):
            upsert_leave_request_draft(
                payload={
                    "employee": employee,
                    "leave_type": leave_type,
                    "start_date": date(2026, 5, 3),
                    "end_date": date(2026, 5, 3),
                    "day_count": Decimal("1.0"),
                    "reason": "Locked period leave",
                },
                performed_by=self.admin,
            )

        with self.assertRaisesMessage(
            ValueError,
            "Payroll period is closed for the selected date.",
        ):
            upsert_employee_expense_claim_draft(
                payload={
                    "employee": employee,
                    "claim_date": date(2026, 5, 4),
                    "expense_date": date(2026, 5, 4),
                    "category": "Travel",
                    "expense_account": self.expense_account,
                    "claimed_amount": Decimal("250.00"),
                },
                performed_by=self.admin,
            )

        with self.assertRaisesMessage(ValueError, "Payroll period is closed."):
            upsert_salary_sheet_draft(
                payload={
                    "employee": employee,
                    "year": 2026,
                    "month": 5,
                    "gross_amount": Decimal("1000.00"),
                    "deductions_amount": Decimal("0.00"),
                    "net_amount": Decimal("1000.00"),
                    "auto_generate": False,
                },
                performed_by=self.admin,
            )

    def test_expense_claim_posting_payment_and_staff_ledger(self):
        employee = EmployeeProfile.objects.create(
            employee_code="EMP-WF-LEDGER-001",
            name="Ledger Employee",
            joining_date=date(2026, 4, 1),
            base_salary=Decimal("900.00"),
        )
        claim = upsert_employee_expense_claim_draft(
            payload={
                "employee": employee,
                "claim_date": date(2026, 4, 20),
                "expense_date": date(2026, 4, 20),
                "category": "Field Travel",
                "expense_account": self.expense_account,
                "claimed_amount": Decimal("300.00"),
                "bill_no": "EXP-001",
            },
            performed_by=self.admin,
        )

        approve_employee_expense_claim(
            expense_claim_id=claim.id,
            approved_amount=Decimal("280.00"),
            approved_by=self.admin,
        )
        claim, posted = post_employee_expense_claim(
            expense_claim_id=claim.id,
            posted_by=self.admin,
        )
        self.assertTrue(posted)
        self.assertEqual(claim.status, ExpenseClaimStatus.POSTED)

        post_employee_expense_claim_payment(
            expense_claim_id=claim.id,
            payment_date=date(2026, 4, 21),
            amount=Decimal("100.00"),
            finance_account_id=self.finance_account.id,
            reference_no="CLAIM-PAY-001",
            posted_by=self.admin,
        )
        claim.refresh_from_db()
        self.assertEqual(claim.status, ExpenseClaimStatus.PAID_PARTIAL)

        ledger = build_staff_ledger(employee_id=employee.id)
        self.assertEqual(len(ledger["rows"]), 2)
        self.assertEqual(ledger["rows"][0]["entry_kind"], "REIMBURSEMENT_ACCRUAL")
        self.assertEqual(ledger["rows"][0]["credit_amount"], "280.00")
        self.assertEqual(ledger["rows"][1]["entry_kind"], "REIMBURSEMENT_PAYMENT")
        self.assertEqual(ledger["rows"][1]["debit_amount"], "100.00")
        self.assertEqual(ledger["employees"][0]["closing_balance"], "180.00")
        self.assertEqual(ledger["employees"][0]["balance_side"], "PAYABLE")

        post_employee_expense_claim_payment(
            expense_claim_id=claim.id,
            payment_date=date(2026, 4, 22),
            amount=Decimal("180.00"),
            finance_account_id=self.finance_account.id,
            reference_no="CLAIM-PAY-002",
            posted_by=self.admin,
        )
        claim.refresh_from_db()
        self.assertEqual(claim.status, ExpenseClaimStatus.PAID)

        ledger = build_staff_ledger(employee_id=employee.id)
        self.assertEqual(len(ledger["rows"]), 3)
        self.assertEqual(ledger["employees"][0]["closing_balance"], "0.00")
