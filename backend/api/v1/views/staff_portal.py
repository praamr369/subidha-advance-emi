from __future__ import annotations

from django.db.models import Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import StaffIdentity
from accounting.models import EmployeeAttendance, SalaryPayment, SalarySheet
from api.v1.permissions import IsAdmin, IsStaff
from api.v1.serializers.accounting import SalarySheetSerializer
from api.v1.serializers.staff_portal import (
    AdminStaffCreateSerializer,
    AdminStaffLoginToggleSerializer,
    StaffIdentitySerializer,
    attendance_payload,
    salary_summary_payload,
    staff_profile_payload,
)


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
