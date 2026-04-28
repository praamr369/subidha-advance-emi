from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AttendanceStatus, EmployeeAttendance, EmployeeProfile, LeaveType, LeaveRequest
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

    def test_admin_can_create_staff_profile_without_duplicate(self):
        created = self.client.post(
            "/api/v1/admin/hr/staff/",
            {"name": "Staff One", "phone": "919300000010", "joining_date": "2026-04-01"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_200_OK, created.data)
        self.assertTrue(EmployeeProfile.objects.filter(phone="919300000010").exists())

        dup = self.client.post(
            "/api/v1/admin/hr/staff/",
            {"name": "Staff Duplicate", "phone": "919300000010", "joining_date": "2026-04-01"},
            format="json",
        )
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST, dup.data)

    def test_admin_can_mark_attendance(self):
        staff = EmployeeProfile.objects.create(name="Staff A", phone="919300000020", joining_date=date(2026, 4, 1))
        response = self.client.post(
            "/api/v1/admin/hr/attendance/",
            {"employee": staff.id, "attendance_date": "2026-04-10", "status": AttendanceStatus.PRESENT},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(EmployeeAttendance.objects.filter(employee=staff, attendance_date="2026-04-10").exists())

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

    def test_non_admin_blocked_from_hr_apis(self):
        self.client.force_authenticate(self.partner)
        response = self.client.get("/api/v1/admin/hr/summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

