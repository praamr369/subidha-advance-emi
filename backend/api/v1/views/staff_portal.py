from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import StaffIdentity
from accounting.models import EmployeeAttendance, LeaveRequest, LeaveRequestStatus, LeaveType, SalaryPayment, SalarySheet
from accounting.services.workforce_service import cancel_leave_request, upsert_leave_request_draft
from api.v1.permissions import IsAdmin, IsStaff
from api.v1.serializers.accounting import LeaveRequestSerializer, LeaveTypeSerializer, SalarySheetSerializer
from api.v1.serializers.staff_portal import (
    AdminStaffCreateSerializer,
    AdminStaffLoginToggleSerializer,
    AdminStaffPasswordResetSerializer,
    StaffIdentitySerializer,
    attendance_payload,
    salary_summary_payload,
    staff_profile_payload,
)
from subscriptions.models import AuditLog


def staff_identity_for_user(user) -> StaffIdentity:
    identity = StaffIdentity.objects.select_related("user", "employee", "employee__branch").filter(user=user).first()
    if identity is None or not identity.login_enabled or not identity.user.is_active:
        raise PermissionDenied("Staff login is not enabled.")
    return identity


class AdminStaffIdentityListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        identities = StaffIdentity.objects.select_related("user", "employee").order_by("employee__name", "id")
        return Response({"results": StaffIdentitySerializer(identities, many=True).data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminStaffCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        identity = serializer.save()
        return Response(serializer.to_representation(identity), status=status.HTTP_201_CREATED)


class AdminStaffIdentityDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_object(self, pk):
        identity = StaffIdentity.objects.select_related("user", "employee").filter(pk=pk).first()
        if identity is None:
            raise NotFound("Staff identity not found.")
        return identity

    def get(self, request, pk: int):
        return Response(StaffIdentitySerializer(self.get_object(pk)).data, status=status.HTTP_200_OK)

    def patch(self, request, pk: int):
        identity = self.get_object(pk)
        serializer = AdminStaffLoginToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        login_enabled = serializer.validated_data["login_enabled"]
        identity.login_enabled = login_enabled
        identity.user.is_active = login_enabled
        identity.user.save(update_fields=["is_active"])
        identity.save(update_fields=["login_enabled", "updated_at"])
        return Response(StaffIdentitySerializer(identity).data, status=status.HTTP_200_OK)


class AdminStaffIdentityResetPasswordView(APIView):
    """
    Resets the password for an existing staff portal login. The new password
    is returned once in the response and is never stored or retrievable
    afterward -- the admin must relay it to the staff member out-of-band.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        identity = StaffIdentity.objects.select_related("user", "employee").filter(pk=pk).first()
        if identity is None:
            raise NotFound("Staff identity not found.")

        serializer = AdminStaffPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = (serializer.validated_data.get("temporary_password") or "").strip() or get_random_string(length=12)

        identity.user.set_password(new_password)
        identity.user.save(update_fields=["password"])
        identity.temporary_password_last_set_at = timezone.now()
        identity.save(update_fields=["temporary_password_last_set_at", "updated_at"])

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.USER_PASSWORD_RESET,
            model_name="StaffIdentity",
            object_id=identity.id,
            performed_by=request.user,
            metadata={"employee_id": identity.employee_id, "user_id": identity.user_id},
        )

        payload = StaffIdentitySerializer(identity).data
        payload["temporary_password"] = new_password
        return Response(payload, status=status.HTTP_200_OK)


class StaffProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        return Response(staff_profile_payload(staff_identity_for_user(request.user)), status=status.HTTP_200_OK)


class StaffDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        employee = identity.employee
        today = timezone.localdate()
        latest_sheet = employee.salary_sheets.order_by("-year", "-month", "-id").first()
        return Response(
            {
                "profile": staff_profile_payload(identity),
                "today_attendance": attendance_payload(employee, year=today.year, month=today.month)["today"],
                "salary_summary": salary_summary_payload(employee),
                "reports": {
                    "attendance_rows": EmployeeAttendance.objects.filter(employee=employee).count(),
                    "payslip_count": SalarySheet.objects.filter(employee=employee).count(),
                    "salary_payment_count": SalaryPayment.objects.filter(salary_sheet__employee=employee).count(),
                },
                "latest_payslip_id": latest_sheet.id if latest_sheet else None,
            },
            status=status.HTTP_200_OK,
        )


class StaffAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        return Response(
            attendance_payload(identity.employee, year=int(year) if year else None, month=int(month) if month else None),
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Self check-in: marks the staff member present for today."""
        from accounting.models import AttendanceStatus, EmployeeAttendance

        identity = staff_identity_for_user(request.user)
        today = timezone.localdate()
        existing = EmployeeAttendance.objects.filter(
            employee=identity.employee, attendance_date=today
        ).first()
        if existing is not None:
            return Response(
                {"detail": "Attendance already recorded for today.", "attendance_date": str(today)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry = EmployeeAttendance.objects.create(
            employee=identity.employee,
            attendance_date=today,
            status=AttendanceStatus.PRESENT,
            recorded_by=request.user,
            notes=(request.data.get("note") or "").strip(),
        )
        return Response(
            {
                "detail": "Checked in successfully.",
                "attendance_date": str(entry.attendance_date),
                "status": entry.status,
            },
            status=status.HTTP_201_CREATED,
        )


class StaffPayslipListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        sheets = identity.employee.salary_sheets.order_by("-year", "-month", "-id")[:36]
        return Response({"results": SalarySheetSerializer(sheets, many=True).data}, status=status.HTTP_200_OK)


class StaffPayslipDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request, pk: int):
        identity = staff_identity_for_user(request.user)
        sheet = identity.employee.salary_sheets.filter(pk=pk).first()
        if sheet is None:
            raise NotFound("Payslip not found.")
        return Response(SalarySheetSerializer(sheet).data, status=status.HTTP_200_OK)


class StaffSalarySummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        return Response(salary_summary_payload(identity.employee), status=status.HTTP_200_OK)


class StaffReportsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        employee = identity.employee
        paid_amount = SalaryPayment.objects.filter(salary_sheet__employee=employee).aggregate(total=Sum("amount"))["total"] or 0
        return Response(
            {
                "employee_id": employee.id,
                "attendance_count": EmployeeAttendance.objects.filter(employee=employee).count(),
                "payslip_count": SalarySheet.objects.filter(employee=employee).count(),
                "salary_payment_count": SalaryPayment.objects.filter(salary_sheet__employee=employee).count(),
                "salary_paid_amount": str(paid_amount),
                "read_only": True,
            },
            status=status.HTTP_200_OK,
        )


class StaffTasksView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        staff_identity_for_user(request.user)
        return Response({"results": [], "detail": "No staff-assigned CRM task source model is exposed yet.", "read_only": True}, status=status.HTTP_200_OK)


class StaffLeaveTypeListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        staff_identity_for_user(request.user)
        leave_types = LeaveType.objects.filter(is_active=True).order_by("code")
        return Response({"results": LeaveTypeSerializer(leave_types, many=True).data}, status=status.HTTP_200_OK)


class StaffLeaveRequestCreateSerializer(serializers.Serializer):
    leave_type = serializers.IntegerField()
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True)


class StaffLeaveRequestsView(APIView):
    """
    Self-service leave for staff: list own leave requests (any status) and
    submit a new one. New requests land as DRAFT -- the same status an admin
    reviews and approves/rejects via the existing admin Leave Requests
    workflow. There is no separate "submitted/pending" state in this system;
    DRAFT already means "awaiting admin decision" once created here.
    """

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        requests_qs = LeaveRequest.objects.select_related("leave_type", "approved_by", "rejected_by").filter(
            employee=identity.employee
        ).order_by("-start_date", "-created_at", "-id")[:100]
        return Response({"results": LeaveRequestSerializer(requests_qs, many=True).data}, status=status.HTTP_200_OK)

    def post(self, request):
        identity = staff_identity_for_user(request.user)
        serializer = StaffLeaveRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        leave_type = LeaveType.objects.filter(pk=vd["leave_type"], is_active=True).first()
        if leave_type is None:
            return Response({"leave_type": "Leave type not found or inactive."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            leave_request = upsert_leave_request_draft(
                payload={
                    "employee": identity.employee,
                    "leave_type": leave_type,
                    "start_date": vd["start_date"],
                    "end_date": vd.get("end_date") or vd["start_date"],
                    "reason": vd.get("reason", ""),
                },
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(LeaveRequestSerializer(leave_request).data, status=status.HTTP_201_CREATED)


class StaffLeaveRequestCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def post(self, request, pk: int):
        identity = staff_identity_for_user(request.user)
        leave_request = LeaveRequest.objects.filter(pk=pk, employee=identity.employee).first()
        if leave_request is None:
            raise NotFound("Leave request not found.")
        reason = (request.data.get("reason") or "Cancelled by staff member.").strip()
        try:
            leave_request, _updated = cancel_leave_request(
                leave_request_id=leave_request.id,
                cancel_reason=reason,
                cancelled_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(LeaveRequestSerializer(leave_request).data, status=status.HTTP_200_OK)


class StaffLeaveBalanceView(APIView):
    """
    Year-to-date leave balance for the logged-in staff member only, including
    monthly accrual (earned so far this year) alongside taken/remaining.
    Access requires an active, login-enabled staff identity -- enforced by
    staff_identity_for_user, so a disabled login can never read leave details.
    """

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        identity = staff_identity_for_user(request.user)
        from accounting.services.workforce_service import leave_balance_rows

        year = timezone.localdate().year
        rows = leave_balance_rows(employee=identity.employee, year=year)
        return Response({"year": year, "results": rows}, status=status.HTTP_200_OK)
