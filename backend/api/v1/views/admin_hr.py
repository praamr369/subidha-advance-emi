from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    AttendanceStatus,
    EmployeeAttendance,
    EmployeeDocument,
    EmployeeExpenseClaim,
    EmployeeProfile,
    EmploymentType,
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
    EmployeeDocumentSerializer,
    LeaveRequestSerializer,
    SalaryPaymentSerializer,
    SalarySheetSerializer,
)
from accounting.services.staff_pdf_service import (
    render_salary_agreement_pdf,
    render_staff_profile_pdf,
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
    designation = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    employment_type = serializers.ChoiceField(choices=EmploymentType.choices, required=False)
    salary_effective_from = serializers.DateField(required=False, allow_null=True)
    temporary_contract_end_date = serializers.DateField(required=False, allow_null=True)
    daily_wage_rate = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    hourly_wage_rate = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    piece_rate_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    piece_rate_unit_label = serializers.CharField(required=False, allow_blank=True)
    kyc_id_type = serializers.CharField(required=False, allow_blank=True)
    kyc_id_number = serializers.CharField(required=False, allow_blank=True)
    kyc_verified = serializers.BooleanField(required=False)
    address = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True)
    cost_center_code = serializers.CharField(required=False, allow_blank=True)
    payroll_expense_account = serializers.IntegerField(required=False, allow_null=True)


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
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(phone__icontains=q)
                | Q(employee_code__icontains=q)
                | Q(department__icontains=q)
                | Q(designation__icontains=q)
            )
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
        profile_serializer = EmployeeProfileSerializer(
            employee,
            data={
                "designation": serializer.validated_data.get("designation") or "",
                "department": serializer.validated_data.get("department") or "",
                "employment_type": serializer.validated_data.get("employment_type") or EmploymentType.PERMANENT_MONTHLY,
                "salary_effective_from": serializer.validated_data.get("salary_effective_from"),
                "temporary_contract_end_date": serializer.validated_data.get("temporary_contract_end_date"),
                "daily_wage_rate": serializer.validated_data.get("daily_wage_rate"),
                "hourly_wage_rate": serializer.validated_data.get("hourly_wage_rate"),
                "piece_rate_amount": serializer.validated_data.get("piece_rate_amount"),
                "piece_rate_unit_label": serializer.validated_data.get("piece_rate_unit_label") or "",
                "kyc_id_type": serializer.validated_data.get("kyc_id_type") or "",
                "kyc_id_number": serializer.validated_data.get("kyc_id_number") or "",
                "kyc_verified": serializer.validated_data.get("kyc_verified", False),
                "address": serializer.validated_data.get("address") or "",
                "emergency_contact_name": serializer.validated_data.get("emergency_contact_name") or "",
                "emergency_contact_phone": serializer.validated_data.get("emergency_contact_phone") or "",
                "cost_center_code": serializer.validated_data.get("cost_center_code") or "",
                "payroll_expense_account": serializer.validated_data.get("payroll_expense_account"),
            },
            partial=True,
            context={"request": request},
        )
        profile_serializer.is_valid(raise_exception=True)
        employee = profile_serializer.save()
        return Response(
            {
                "employee": EmployeeProfileSerializer(employee, context={"request": request}).data,
                "user_id": getattr(payload.get("user"), "id", None),
            }
        )


class AdminHrStaffPatchView(_AdminBase):
    def patch(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        next_phone = (request.data.get("phone") or "").strip()
        if next_phone and EmployeeProfile.objects.filter(phone=next_phone, is_active=True).exclude(pk=employee.id).exists():
            raise serializers.ValidationError({"phone": "An active staff profile already exists with this phone number."})
        serializer = EmployeeProfileSerializer(
            employee,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            updated = serializer.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return Response(EmployeeProfileSerializer(updated, context={"request": request}).data)


class HrStaffStatusSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[("DEACTIVATE", "DEACTIVATE"), ("REACTIVATE", "REACTIVATE")])


class AdminHrStaffStatusView(_AdminBase):
    def post(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        serializer = HrStaffStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        employee.is_active = action == "REACTIVATE"
        employee.save(update_fields=["is_active", "updated_at"])
        return Response(EmployeeProfileSerializer(employee, context={"request": request}).data)


class AdminHrStaffProfilePdfView(_AdminBase):
    def get(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        pdf_bytes = render_staff_profile_pdf(employee=employee)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="staff-profile-{employee.employee_code or employee.id}.pdf"'
        )
        return response


class AdminHrSalaryAgreementPdfView(_AdminBase):
    def get(self, request, staff_id: int):
        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        pdf_bytes = render_salary_agreement_pdf(employee=employee)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="salary-agreement-{employee.employee_code or employee.id}.pdf"'
        )
        return response


class AdminHrStaffDocumentsListCreateView(_AdminBase):
    def get(self, request):
        qs = EmployeeDocument.objects.select_related("employee", "uploaded_by").order_by("-created_at", "-id")
        staff_id = request.query_params.get("staff")
        if staff_id:
            qs = qs.filter(employee_id=staff_id)
        results = list(qs[:200])
        return Response(
            {
                "count": qs.count(),
                "results": EmployeeDocumentSerializer(results, many=True, context={"request": request}).data,
            }
        )

    def post(self, request):
        serializer = EmployeeDocumentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save(uploaded_by=request.user)
        return Response(EmployeeDocumentSerializer(document, context={"request": request}).data)


class AdminHrStaffDocumentPatchView(_AdminBase):
    def patch(self, request, document_id: int):
        document = get_object_or_404(EmployeeDocument, pk=document_id)
        serializer = EmployeeDocumentSerializer(
            document,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(EmployeeDocumentSerializer(updated, context={"request": request}).data)


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
        sheets = SalarySheet.objects.select_related("employee", "payroll_period").order_by("-created_at", "-id")[:50]
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

