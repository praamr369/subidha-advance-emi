from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AttendanceStatus,
    EmployeeAttendance,
    EmployeeProfile,
    EmployeeStatus,
    EmploymentType,
    LeaveType,
    LeaveRequest,
)
from tests.helpers import create_admin_user, create_user


class AdminHrApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="hr_admin", phone="919300000001")
        self.partner = create_user(
            username="hr_partner",
            role="PARTNER",
            phone="919300000002",
            password="PartnerPass123!",
        )
        self.client.force_authenticate(self.admin)

    def test_admin_can_view_hr_summary(self):
        response = self.client.get("/api/v1/admin/hr/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("total_active_staff", response.data)

    # --- Staff creation ---

    def test_draft_staff_creation_succeeds_with_minimal_fields(self):
        """DRAFT staff can be created with only name and phone (no activation requirements)."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Draft Staff",
                "phone": "919300000010",
                "employment_status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        emp = EmployeeProfile.objects.get(phone="919300000010")
        self.assertEqual(emp.employment_status, EmployeeStatus.DRAFT)
        self.assertFalse(emp.is_active)

    def test_active_staff_creation_returns_400_without_required_fields(self):
        """ACTIVE status requires designation, branch, department, joining_date."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Active Missing Fields",
                "phone": "919300000011",
                "employment_status": "ACTIVE",
                # Missing: designation, branch, department, joining_date
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        # Should return field errors not a generic 500
        self.assertIn("designation", response.data)

    def test_duplicate_active_phone_returns_400(self):
        """Duplicate phone for active staff returns 400, not 500."""
        # Create first active staff directly
        EmployeeProfile.objects.create(
            name="First Staff",
            phone="919300000012",
            joining_date=date(2026, 4, 1),
            is_active=True,
            employment_status=EmployeeStatus.ACTIVE,
        )
        dup = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Duplicate Staff",
                "phone": "919300000012",
                "employment_status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST, dup.data)
        self.assertIn("phone", dup.data)

    def test_draft_with_same_phone_as_inactive_allowed(self):
        """Draft staff can reuse a phone that belongs to an inactive record."""
        EmployeeProfile.objects.create(
            name="Old Staff",
            phone="919300000013",
            joining_date=date(2026, 1, 1),
            is_active=False,
            employment_status=EmployeeStatus.INACTIVE,
        )
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "New Staff Same Phone",
                "phone": "919300000013",
                "employment_status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_payroll_eligible_requires_salary_setup(self):
        """Payroll-eligible PERMANENT_MONTHLY staff without base_salary returns 400."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Payroll Staff",
                "phone": "919300000014",
                "employment_status": "DRAFT",
                "employment_type": "PERMANENT_MONTHLY",
                "payroll_eligible": True,
                "salary_effective_from": "2026-04-01",
                # Missing: base_salary
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("base_salary", response.data)

    def test_payroll_eligible_with_valid_setup_succeeds(self):
        """Payroll-eligible DRAFT staff with full salary setup creates successfully."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Payroll Ready",
                "phone": "919300000015",
                "employment_status": "DRAFT",
                "employment_type": "PERMANENT_MONTHLY",
                "payroll_eligible": True,
                "salary_effective_from": "2026-04-01",
                "base_salary": "15000.00",
                "payment_mode": "CASH",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        emp = EmployeeProfile.objects.get(phone="919300000015")
        self.assertTrue(emp.payroll_eligible)
        self.assertIsNotNone(emp.base_salary)

    def test_create_login_without_role_returns_400(self):
        """Requesting login account creation without a user role returns 400."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Login Staff",
                "phone": "919300000016",
                "employment_status": "DRAFT",
                "create_login_account": True,
                # Missing: user_role
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("user_role", response.data)

    def test_no_payroll_journal_created_on_staff_creation(self):
        """Staff creation must not create any SalarySheet or SalaryPayment records."""
        from accounting.models import SalarySheet, SalaryPayment
        before_sheets = SalarySheet.objects.count()
        before_payments = SalaryPayment.objects.count()
        self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "name": "Clean Staff",
                "phone": "919300000017",
                "employment_status": "DRAFT",
                "payroll_eligible": True,
                "employment_type": "PERMANENT_MONTHLY",
                "salary_effective_from": "2026-04-01",
                "base_salary": "20000.00",
            },
            format="json",
        )
        self.assertEqual(SalarySheet.objects.count(), before_sheets, "Staff creation must not create salary sheets")
        self.assertEqual(SalaryPayment.objects.count(), before_payments, "Staff creation must not create salary payments")

    def test_field_aliases_resolved(self):
        """full_name and title aliases map to name and designation."""
        response = self.client.post(
            "/api/v1/admin/hr/staff/",
            {
                "full_name": "Alias Staff",
                "phone": "919300000018",
                "title": "Manager",
                "employment_status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        emp = EmployeeProfile.objects.get(phone="919300000018")
        self.assertEqual(emp.name, "Alias Staff")
        self.assertEqual(emp.designation, "Manager")

    # --- Attendance ---

    def test_admin_can_mark_attendance(self):
        staff = EmployeeProfile.objects.create(name="Staff A", phone="919300000020", joining_date=date(2026, 4, 1))
        response = self.client.post(
            "/api/v1/admin/hr/attendance/",
            {"employee": staff.id, "attendance_date": "2026-04-10", "status": AttendanceStatus.PRESENT},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(EmployeeAttendance.objects.filter(employee=staff, attendance_date="2026-04-10").exists())

    # --- Leave ---

    def test_leave_approval_and_rejection_work(self):
        staff = EmployeeProfile.objects.create(name="Staff L", phone="919300000030", joining_date=date(2026, 4, 1))
        leave_type = LeaveType.objects.create(code="CL", name="Casual Leave")
        leave = LeaveRequest.objects.create(
            employee=staff,
            leave_type=leave_type,
            start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 10),
            day_count="1.0",
            status="DRAFT",
            reason="Need leave",
        )

        approve = self.client.patch(
            f"/api/v1/admin/hr/leave-requests/{leave.id}/",
            {"action": "APPROVE"},
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK, approve.data)

        leave2 = LeaveRequest.objects.create(
            employee=staff,
            leave_type=leave_type,
            start_date=date(2026, 4, 11),
            end_date=date(2026, 4, 11),
            day_count="1.0",
            status="DRAFT",
            reason="Need leave",
        )
        reject = self.client.patch(
            f"/api/v1/admin/hr/leave-requests/{leave2.id}/",
            {"action": "REJECT", "reason": "Not allowed"},
            format="json",
        )
        self.assertEqual(reject.status_code, status.HTTP_200_OK, reject.data)

    # --- Access control ---

    def test_non_admin_blocked_from_hr_apis(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/hr/summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_and_vendor_blocked_from_hr_apis(self):
        customer = create_user(
            username="hr_customer",
            role="CUSTOMER",
            phone="919300000099",
            password="CustomerPass123!",
        )
        vendor = create_user(
            username="hr_vendor",
            role="VENDOR",
            phone="919300000098",
            password="VendorPass123!",
        )

        for actor in (customer, vendor):
            self.client.force_authenticate(actor)
            summary = self.client.get("/api/v1/admin/hr/summary/")
            payroll = self.client.get("/api/v1/admin/hr/payroll/")
            staff = self.client.get("/api/v1/admin/hr/staff/")
            self.assertEqual(summary.status_code, status.HTTP_403_FORBIDDEN, summary.data)
            self.assertEqual(payroll.status_code, status.HTTP_403_FORBIDDEN, payroll.data)
            self.assertEqual(staff.status_code, status.HTTP_403_FORBIDDEN, staff.data)
