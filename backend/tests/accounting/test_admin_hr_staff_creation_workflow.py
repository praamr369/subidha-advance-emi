from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import StaffIdentity, UserRole
from accounting.models import EmployeeDocument, EmployeeProfile, JournalEntry, MoneyMovement, SalaryPayment
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
        self.branch, _ = Branch.objects.get_or_create(
            is_primary=True,
            defaults={"code": "BR-MAIN", "name": "Main Branch"},
        )
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

    def test_staff_profile_persists_weekly_off_and_salary_type_alias(self):
        response = self.client.post(
            self.url,
            {
                "full_name": "Alias Staff",
                "phone": "9000000006",
                "employment_status": "ONBOARDING",
                "designation": "Cashier",
                "branch": self.branch.id,
                "department": "COLLECTION",
                "joining_date": "2026-06-01",
                "salary_type": "DAILY_WAGE",
                "daily_wage_rate": "450.00",
                "payroll_eligible": True,
                "salary_effective_from": "2026-06-01",
                "payment_mode": "CASH",
                "weekly_off": "sunday",
                "emergency_contact_name": "Sita",
                "emergency_contact_relation": "spouse",
                "emergency_contact_phone": "9000000099",
                "attendance_policy": "DAY_SHIFT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        employee = EmployeeProfile.objects.get(phone="9000000006")
        self.assertEqual(employee.employment_type, "DAILY_WAGE")
        self.assertEqual(employee.weekly_off, "SUNDAY")
        self.assertEqual(employee.emergency_contact_relation, "SPOUSE")

        timeline = self.client.get(f"/api/v1/admin/audit-logs/timeline/EmployeeProfile/{employee.id}/")
        self.assertEqual(timeline.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(
                item["metadata"].get("hr_event") == "HR_STAFF_PROFILE_CREATED"
                for item in timeline.data["results"]
            )
        )

    def test_staff_document_review_writes_audit_timeline(self):
        create_response = self.client.post(
            self.url,
            {
                "full_name": "Document Staff",
                "phone": "9000000007",
                "employment_status": "ONBOARDING",
                "designation": "Inventory Staff",
                "branch": self.branch.id,
                "department": "INVENTORY",
                "joining_date": "2026-06-01",
                "employment_type": "PERMANENT_MONTHLY",
                "attendance_policy": "DAY_SHIFT",
                "payroll_eligible": False,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        employee = EmployeeProfile.objects.get(phone="9000000007")

        upload = SimpleUploadedFile("id-proof.txt", b"document", content_type="text/plain")
        doc_response = self.client.post(
            "/api/v1/admin/hr/staff-documents/",
            {
                "employee": employee.id,
                "document_type": "ID_PROOF",
                "title": "Identity proof",
                "document_no": "ID-100",
                "notes": "Uploaded for review.",
                "file": upload,
            },
            format="multipart",
        )
        self.assertEqual(doc_response.status_code, status.HTTP_201_CREATED)
        document_id = doc_response.data["id"]
        self.assertTrue(EmployeeDocument.objects.filter(id=document_id, employee=employee).exists())

        review_response = self.client.post(
            f"/api/v1/admin/hr/staff-documents/{document_id}/review/",
            {"action": "verify", "notes": "Matches records."},
            format="json",
        )
        self.assertEqual(review_response.status_code, status.HTTP_200_OK)
        self.assertEqual(review_response.data["status"], "ACTIVE")

        timeline = self.client.get(f"/api/v1/admin/audit-logs/timeline/EmployeeDocument/{employee.id}/")
        self.assertEqual(timeline.status_code, status.HTTP_200_OK)
        events = timeline.data["results"]
        self.assertTrue(any(item["metadata"].get("hr_event") == "HR_STAFF_DOCUMENT_CREATED" for item in events))
        self.assertTrue(any(item["metadata"].get("hr_event") == "HR_STAFF_DOCUMENT_VERIFIED" for item in events))
