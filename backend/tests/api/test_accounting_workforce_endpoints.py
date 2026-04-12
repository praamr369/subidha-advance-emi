from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
    LeaveType,
)
from accounting.services.salary_posting_service import approve_salary_sheet, post_salary_sheet
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)
from accounting.models import EmployeeProfile


class AccountingWorkforceEndpointsTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_workforce_admin",
            phone="9357000001",
        )
        self.partner = create_partner_user(
            username="accounting_workforce_partner",
            phone="9357000002",
        )
        self.cashier = create_cashier_user(
            username="accounting_workforce_cashier",
            phone="9357000003",
        )
        self.customer_user = create_customer_user(
            username="accounting_workforce_customer",
            phone="7357000001",
        )
        create_customer_profile(
            user=self.customer_user,
            name="Accounting Workforce Customer",
            phone="7357000001",
        )

    def test_non_admin_roles_cannot_access_workforce_accounting_endpoints(self):
        endpoints = [
            "/api/v1/accounting/attendance/",
            "/api/v1/accounting/leave-requests/",
            "/api/v1/accounting/expense-claims/",
            "/api/v1/accounting/salary-payments/",
            "/api/v1/accounting/reports/staff-ledger/",
        ]
        for user in [self.partner, self.cashier, self.customer_user]:
            self.client.force_authenticate(user=user)
            for endpoint in endpoints:
                response = self.client.get(endpoint)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected access for {user.role} on {endpoint}",
                )

    def test_admin_can_record_attendance_and_salary_payment(self):
        self.client.force_authenticate(user=self.admin)
        employee = EmployeeProfile.objects.create(
            name="Workforce Employee",
            phone="918800000001",
            designation="Account Assistant",
            department="Finance",
            joining_date="2026-04-01",
            base_salary=Decimal("1800.00"),
        )
        salary_sheet = employee.salary_sheets.create(
            year=2026,
            month=4,
            gross_amount=Decimal("1800.00"),
            deductions_amount=Decimal("300.00"),
            net_amount=Decimal("1500.00"),
        )
        approve_salary_sheet(salary_sheet_id=salary_sheet.id, approved_by=self.admin)
        post_salary_sheet(salary_sheet_id=salary_sheet.id, posted_by=self.admin)

        finance_account = FinanceAccount.objects.create(
            name="Salary Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=ChartOfAccount.objects.create(
                code="WF-BANK-001",
                name="Workforce Bank",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )

        attendance_response = self.client.post(
            "/api/v1/accounting/attendance/",
            {
                "employee": employee.id,
                "attendance_date": "2026-04-09",
                "status": "PRESENT",
                "notes": "Full day",
            },
            format="json",
        )
        self.assertEqual(attendance_response.status_code, status.HTTP_201_CREATED, attendance_response.data)
        self.assertEqual(attendance_response.data["status"], "PRESENT")

        salary_payment_response = self.client.post(
            "/api/v1/accounting/salary-payments/",
            {
                "salary_sheet": salary_sheet.id,
                "payment_date": "2026-04-10",
                "amount": "500.00",
                "finance_account": finance_account.id,
                "reference_no": "WF-SAL-001",
            },
            format="json",
        )
        self.assertEqual(salary_payment_response.status_code, status.HTTP_201_CREATED, salary_payment_response.data)
        self.assertEqual(salary_payment_response.data["amount"], "500.00")

    def test_admin_can_run_leave_claim_and_staff_ledger_endpoints(self):
        self.client.force_authenticate(user=self.admin)
        employee = EmployeeProfile.objects.create(
            name="Workforce Leave Employee",
            phone="918800000101",
            designation="Floor Supervisor",
            department="Operations",
            joining_date="2026-04-01",
            base_salary=Decimal("2200.00"),
        )
        leave_type = LeaveType.objects.create(
            code="UNPAID",
            name="Unpaid Leave",
            is_paid=False,
        )
        finance_account = FinanceAccount.objects.create(
            name="Staff Claim Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=ChartOfAccount.objects.create(
                code="WF-BANK-002",
                name="Workforce Claim Bank",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )
        expense_account = ChartOfAccount.objects.create(
            code="WF-EXP-002",
            name="Employee Claim Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )

        leave_request_response = self.client.post(
            "/api/v1/accounting/leave-requests/",
            {
                "employee": employee.id,
                "leave_type": leave_type.id,
                "start_date": "2026-04-18",
                "end_date": "2026-04-18",
                "day_count": "1.0",
                "reason": "Family work",
            },
            format="json",
        )
        self.assertEqual(
            leave_request_response.status_code,
            status.HTTP_201_CREATED,
            leave_request_response.data,
        )

        approve_response = self.client.post(
            f"/api/v1/accounting/leave-requests/{leave_request_response.data['id']}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        self.assertEqual(approve_response.data["leave_request"]["status"], "APPROVED")

        calendar_response = self.client.get(
            "/api/v1/accounting/reports/attendance-calendar/",
            {
                "employee": employee.id,
                "year": 2026,
                "month": 4,
            },
        )
        self.assertEqual(calendar_response.status_code, status.HTTP_200_OK)
        self.assertEqual(calendar_response.data["summary"]["leave_count"], 1)

        claim_response = self.client.post(
            "/api/v1/accounting/expense-claims/",
            {
                "employee": employee.id,
                "claim_date": "2026-04-20",
                "expense_date": "2026-04-20",
                "category": "Travel",
                "expense_account": expense_account.id,
                "claimed_amount": "350.00",
                "bill_no": "WF-CLAIM-001",
                "notes": "Taxi and loading support",
            },
            format="json",
        )
        self.assertEqual(claim_response.status_code, status.HTTP_201_CREATED, claim_response.data)

        claim_approve_response = self.client.post(
            f"/api/v1/accounting/expense-claims/{claim_response.data['id']}/approve/",
            {"approved_amount": "300.00"},
            format="json",
        )
        self.assertEqual(
            claim_approve_response.status_code,
            status.HTTP_200_OK,
            claim_approve_response.data,
        )
        self.assertEqual(
            claim_approve_response.data["expense_claim"]["status"],
            "APPROVED",
        )

        claim_post_response = self.client.post(
            f"/api/v1/accounting/expense-claims/{claim_response.data['id']}/post/",
            {},
            format="json",
        )
        self.assertEqual(
            claim_post_response.status_code,
            status.HTTP_200_OK,
            claim_post_response.data,
        )
        self.assertEqual(
            claim_post_response.data["expense_claim"]["status"],
            "POSTED",
        )

        claim_payment_response = self.client.post(
            "/api/v1/accounting/expense-claim-payments/",
            {
                "expense_claim": claim_response.data["id"],
                "payment_date": "2026-04-21",
                "amount": "120.00",
                "finance_account": finance_account.id,
                "reference_no": "WF-REIM-001",
            },
            format="json",
        )
        self.assertEqual(
            claim_payment_response.status_code,
            status.HTTP_201_CREATED,
            claim_payment_response.data,
        )

        staff_ledger_response = self.client.get(
            "/api/v1/accounting/reports/staff-ledger/",
            {"employee": employee.id},
        )
        self.assertEqual(staff_ledger_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(staff_ledger_response.data["rows"]), 2)
        self.assertEqual(
            staff_ledger_response.data["employees"][0]["closing_balance"],
            "180.00",
        )
