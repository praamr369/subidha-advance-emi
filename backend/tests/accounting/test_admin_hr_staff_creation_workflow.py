from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import StaffIdentity, UserRole
from accounting.models import EmployeeProfile, JournalEntry, MoneyMovement, SalaryPayment
from branch_control.models import Branch


User = get_user_model()


class AdminHrStaffCreationWorkflowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            password="pass12345",
            phone="9000000000",
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.branch = Branch.objects.create(code="BR-MAIN", name="Main Branch", is_primary=True)
        self.client.force_authenticate(self.admin)
        self.url = "/api/v1/admin/hr/staff/"

    def test_save_draft_creates_staff_profile_without_accounting_side_effects(self):
        response = self.client.post(
            self.url,
            {
                "full_name": "Rina Das",
                "phone": "9000000001",
                "employment_status": "DRAFT",
                "notes": "Interview completed.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(EmployeeProfile.objects.count(), 1)
        employee = EmployeeProfile.objects.get()
        self.assertEqual(employee.name, "Rina Das")
        self.assertFalse(employee.is_active)
        self.assertEqual(employee.employment_status, "DRAFT")
        self.assertEqual(StaffIdentity.objects.count(), 0)
        self.assertEqual(JournalEntry.objects.count(), 0)
        self.assertEqual(MoneyMovement.objects.count(), 0)
        self.assertEqual(SalaryPayment.objects.count(), 0)

    def test_duplicate_phone_returns_controlled_validation_error(self):
        EmployeeProfile.objects.create(
            name="Existing Staff",
            phone="9000000002",
            branch=self.branch,
            joining_date="2026-06-01",
            employment_status="ACTIVE",
            is_active=True,
        )

        response = self.client.post(
            self.url,
            {
                "full_name": "Duplicate Staff",
                "phone": "9000000002",
                "employment_status": "DRAFT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)
        self.assertEqual(EmployeeProfile.objects.count(), 1)

    def test_invalid_payroll_setup_returns_400_without_profile_or_journal(self):
        response = self.client.post(
            self.url,
            {
                "full_name": "Payroll Missing",
                "phone": "9000000003",
                "employment_status": "ONBOARDING",
                "designation": "Cashier",
                "branch": self.branch.id,
                "department": "COLLECTION",
                "joining_date": "2026-06-01",
                "employment_type": "PERMANENT_MONTHLY",
                "payroll_eligible": True,
                "salary_effective_from": "2026-06-01",
                "payment_mode": "CASH",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("base_salary", response.data)
        self.assertEqual(EmployeeProfile.objects.count(), 0)
        self.assertEqual(JournalEntry.objects.count(), 0)
        self.assertEqual(MoneyMovement.objects.count(), 0)
        self.assertEqual(SalaryPayment.objects.count(), 0)

    def test_invalid_login_request_returns_400_without_partial_user_or_staff(self):
        before_user_count = User.objects.count()
        response = self.client.post(
            self.url,
            {
                "full_name": "Wrong Login Role",
                "phone": "9000000004",
                "employment_status": "DRAFT",
                "create_login_account": True,
                "user_role": "ADMIN",
                "username": "wrong-role-staff",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_role", response.data)
        self.assertEqual(User.objects.count(), before_user_count)
        self.assertEqual(EmployeeProfile.objects.count(), 0)
        self.assertEqual(StaffIdentity.objects.count(), 0)

    def test_staff_login_creation_is_atomic_and_staff_scoped(self):
        response = self.client.post(
            self.url,
            {
                "full_name": "Login Staff",
                "phone": "9000000005",
                "email": "login.staff@example.com",
                "employment_status": "ONBOARDING",
                "designation": "Inventory Staff",
                "branch": self.branch.id,
                "department": "INVENTORY",
                "joining_date": "2026-06-01",
                "employment_type": "PERMANENT_MONTHLY",
                "attendance_policy": "DAY_SHIFT",
                "shift": "DAY",
                "create_login_account": True,
                "user_role": "STAFF",
                "username": "login-staff",
                "temporary_password": "TempPass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(EmployeeProfile.objects.count(), 1)
        self.assertEqual(StaffIdentity.objects.count(), 1)
        identity = StaffIdentity.objects.select_related("user", "employee").get()
        self.assertEqual(identity.user.role, UserRole.STAFF)
        self.assertEqual(identity.user.username, "login-staff")
        self.assertEqual(identity.employee.phone, "9000000005")
        self.assertEqual(JournalEntry.objects.count(), 0)
        self.assertEqual(MoneyMovement.objects.count(), 0)
        self.assertEqual(SalaryPayment.objects.count(), 0)
