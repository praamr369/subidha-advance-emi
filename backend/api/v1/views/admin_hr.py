from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    AttendanceStatus,
    EmployeeAttendance,
    EmployeeExpenseClaim,
    EmployeeProfile,
    LeaveRequest,
    PayrollPeriod,
    SalaryPayment,
    SalarySheet,
)
from accounting.services.hr_workspace_service import (
    approve_expense_claim_action,
    approve_leave_request_action,
    create_staff_profile,
    get_hr_summary,
    mark_attendance,
    record_salary_payment,
    reject_expense_claim_action,
    reject_leave_request_action,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting import (
    EmployeeAttendanceSerializer,
    EmployeeExpenseClaimSerializer,
    EmployeeProfileSerializer,
    LeaveRequestSerializer,
    SalaryPaymentSerializer,
    SalarySheetSerializer,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminHrSummaryView(_AdminBase):
    def get(self, request):
        return Response(get_hr_summary())


class HrStaffCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    phone = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=[("ADMIN", "ADMIN"), ("CASHIER", "CASHIER")], required=False)
    branch = serializers.IntegerField(required=False, allow_null=True)
    cash_counter = serializers.IntegerField(required=False, allow_null=True)
    joining_date = serializers.DateField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)
    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminHrStaffListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeProfile.objects.select_related("branch").all().order_by("name", "id")
        is_active = request.query_params.get("is_active")
        branch_id = request.query_params.get("branch")
        q = (request.query_params.get("q") or "").strip()
        if is_active in {"true", "false"}:
            qs = qs.filter(is_active=is_active == "true")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if q:
            qs = qs.filter(name__icontains=q) | qs.filter(phone__icontains=q) | qs.filter(employee_code__icontains=q)
        qs = qs[:200]
        return Response({"count": qs.count(), "results": EmployeeProfileSerializer(qs, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = HrStaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = create_staff_profile(
                performed_by=request.user,
                name=serializer.validated_data["name"],
                phone=serializer.validated_data["phone"],
                email=serializer.validated_data.get("email") or None,
                role=serializer.validated_data.get("role"),
                branch_id=serializer.validated_data.get("branch"),
                cash_counter_id=serializer.validated_data.get("cash_counter"),
                joining_date=serializer.validated_data.get("joining_date"),
                is_active=serializer.validated_data.get("is_active", True),
                base_salary=serializer.validated_data.get("base_salary"),
                notes=serializer.validated_data.get("notes") or "",
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

        employee = payload["employee"]
        return Response(
            {
                "employee": EmployeeProfileSerializer(employee, context={"request": request}).data,
                "user_id": getattr(payload.get("user"), "id", None),
            }
        )


class AdminHrStaffPatchView(_AdminBase):
    def patch(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        serializer = EmployeeProfileSerializer(
            employee,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(EmployeeProfileSerializer(updated, context={"request": request}).data)


class HrAttendanceCreateSerializer(serializers.Serializer):
    employee = serializers.IntegerField()
    attendance_date = serializers.DateField(required=False)
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    notes = serializers.CharField(required=False, allow_blank=True)
    worked_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    overtime_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)


class AdminHrAttendanceListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeAttendance.objects.select_related("employee").all().order_by("-attendance_date", "-id")
        from_date = request.query_params.get("from")
        to_date = request.query_params.get("to")
        employee_id = request.query_params.get("employee")
        status_value = request.query_params.get("status")
        if from_date:
            qs = qs.filter(attendance_date__gte=from_date)
        if to_date:
            qs = qs.filter(attendance_date__lte=to_date)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": EmployeeAttendanceSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = HrAttendanceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = get_object_or_404(EmployeeProfile, pk=serializer.validated_data["employee"])
        attendance_date = serializer.validated_data.get("attendance_date") or timezone.localdate()
        attendance = mark_attendance(
            performed_by=request.user,
            employee=employee,
            attendance_date=attendance_date,
            status=serializer.validated_data["status"],
            notes=serializer.validated_data.get("notes") or "",
            worked_hours=serializer.validated_data.get("worked_hours"),
            overtime_hours=serializer.validated_data.get("overtime_hours"),
        )
        return Response(EmployeeAttendanceSerializer(attendance, context={"request": request}).data)


class HrLeavePatchSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("APPROVE", "APPROVE"), ("REJECT", "REJECT")])
    reason = serializers.CharField(required=False, allow_blank=True)


class AdminHrLeaveRequestsListCreateView(_AdminBase):
    def get(self, request):
        qs = LeaveRequest.objects.select_related("employee", "leave_type").all().order_by("-created_at", "-id")
        status_value = request.query_params.get("status")
        employee_id = request.query_params.get("employee")
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": LeaveRequestSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        # Leave requests are created through existing accounting workflow; keep HR layer read/approve/reject.
        raise serializers.ValidationError({"detail": "Create leave requests via the leave request module."})


class AdminHrLeaveRequestPatchView(_AdminBase):
    def patch(self, request, leave_request_id: int):
        serializer = HrLeavePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        if action == "APPROVE":
            updated = approve_leave_request_action(performed_by=request.user, leave_request_id=leave_request_id)
        else:
            updated = reject_leave_request_action(
                performed_by=request.user,
                leave_request_id=leave_request_id,
                reason=serializer.validated_data.get("reason") or "",
            )
        return Response(LeaveRequestSerializer(updated, context={"request": request}).data)


class HrExpensePatchSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("APPROVE", "APPROVE"), ("REJECT", "REJECT")])
    reason = serializers.CharField(required=False, allow_blank=True)


class AdminHrExpenseClaimsListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeExpenseClaim.objects.select_related("employee").all().order_by("-created_at", "-id")
        status_value = request.query_params.get("status")
        employee_id = request.query_params.get("employee")
        if status_value:
            qs = qs.filter(status=status_value.strip().upper())
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": EmployeeExpenseClaimSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        raise serializers.ValidationError({"detail": "Create expense claims via the expense claim module."})


class AdminHrExpenseClaimPatchView(_AdminBase):
    def patch(self, request, expense_claim_id: int):
        serializer = HrExpensePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        if action == "APPROVE":
            updated = approve_expense_claim_action(performed_by=request.user, expense_claim_id=expense_claim_id)
        else:
            updated = reject_expense_claim_action(
                performed_by=request.user,
                expense_claim_id=expense_claim_id,
                reason=serializer.validated_data.get("reason") or "",
            )
        return Response(EmployeeExpenseClaimSerializer(updated, context={"request": request}).data)


class AdminHrPayrollView(_AdminBase):
    def get(self, request):
        period = PayrollPeriod.objects.order_by("-year", "-month", "-id").first()
        sheets = SalarySheet.objects.select_related("employee", "period").order_by("-created_at", "-id")[:50]
        return Response(
            {
                "current_period": None if period is None else {"id": period.id, "code": period.code, "status": period.status},
                "salary_sheets": SalarySheetSerializer(sheets, many=True, context={"request": request}).data,
            }
        )


class AdminHrSalaryPaymentsListCreateView(_AdminBase):
    def get(self, request):
        qs = SalaryPayment.objects.select_related("salary_sheet", "branch", "finance_account").order_by("-payment_date", "-id")
        results = list(qs[:200])
        return Response({"count": qs.count(), "results": SalaryPaymentSerializer(results, many=True, context={"request": request}).data})

    def post(self, request):
        serializer = SalaryPaymentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        record_salary_payment(performed_by=request.user, salary_payment=payment)
        return Response(SalaryPaymentSerializer(payment, context={"request": request}).data)

