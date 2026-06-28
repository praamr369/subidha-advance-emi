from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    ChartOfAccount,
    EmployeeAttendance,
    EmployeeExpenseClaim,
    EmployeeExpenseClaimPayment,
    EmployeeProfile,
    ExpenseVoucher,
    FinanceAccount,
    JournalEntry,
    LeaveRequest,
    LeaveType,
    MoneyMovement,
    PayrollPeriod,
    SalaryPayment,
    SalarySheet,
    StaffAdvance,
    Vendor,
    JournalEntryGroup,
)
from accounts.capabilities import require_capability
from accounting.services.control_validation_service import (
    validate_financial_period_balance,
    validate_journal_group_balance,
)
from accounting.services.expense_posting_service import (
    approve_expense_voucher,
    post_expense_voucher,
)
from accounting.services.journal_posting_service import (
    post_journal_entry,
    reverse_journal_group,
    void_journal_entry,
)
from accounting.services.money_movement_service import post_money_movement
from accounting.services.vendor_operational_service import build_vendor_operational_summary
from accounting.services.salary_posting_service import (
    approve_salary_sheet,
    post_salary_sheet,
)
from accounting.services.workforce_service import (
    approve_employee_expense_claim,
    approve_leave_request,
    build_attendance_calendar,
    build_staff_ledger,
    cancel_leave_request,
    close_payroll_period,
    post_employee_expense_claim,
    reject_employee_expense_claim,
    reject_leave_request,
)
from api.v1.pagination import AdminAccountingPagination
from api.v1.permissions import IsAdmin
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

from api.v1.serializers.accounting import (
    AccountingValidationQuerySerializer,
    ChartOfAccountSerializer,
    ChartOfAccountCreateSerializer,
    ChartOfAccountDetailSerializer,
    ChartOfAccountUpdateSerializer,
    EmployeeExpenseClaimActionSerializer,
    EmployeeExpenseClaimPaymentSerializer,
    EmployeeExpenseClaimSerializer,
    EmployeeAttendanceSerializer,
    EmptyActionSerializer,
    EmployeeProfileSerializer,
    ExpenseVoucherSerializer,
    FinanceAccountSerializer,
    FinanceAccountDetailSerializer,
    FinanceAccountUpdateSerializer,
    JournalEntryPostSerializer,
    JournalGroupReverseSerializer,
    JournalEntrySerializer,
    JournalEntryVoidSerializer,
    LeaveRequestActionSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
    MoneyMovementSerializer,
    PayrollPeriodCloseSerializer,
    PayrollPeriodSerializer,
    SalaryPaymentSerializer,
    SalarySheetSerializer,
    StaffAdvanceSerializer,
    VendorSerializer,
)


class AdminAccountingModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class ChartOfAccountViewSet(AdminAccountingModelViewSet):
    queryset = ChartOfAccount.objects.select_related("parent").all()
    serializer_class = ChartOfAccountSerializer
    pagination_class = AdminAccountingPagination
    search_fields = ["code", "name", "system_code"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code", "id"]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=instance,
            performed_by=self.request.user,
            metadata={
                "event": "CHART_OF_ACCOUNT_MANUAL_CREATE",
                "code": instance.code,
                "account_type": instance.account_type,
            },
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = serializer.instance
        output = ChartOfAccountSerializer(instance, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def get_queryset(self):
        queryset = super().get_queryset()
        account_type = (self.request.query_params.get("account_type") or "").strip().upper()
        is_active = self.request.query_params.get("is_active")
        if account_type:
            queryset = queryset.filter(account_type=account_type)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active in {"1", "true", "TRUE", "yes", "YES"})
        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return ChartOfAccountCreateSerializer
        if self.action == "retrieve":
            return ChartOfAccountDetailSerializer
        if self.action == "partial_update":
            return ChartOfAccountUpdateSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["get"], url_path="editability")
    def editability(self, request, pk=None):
        account = self.get_object()
        payload = ChartOfAccountDetailSerializer(
            account,
            context=self.get_serializer_context(),
        ).data
        return Response(
            {
                "success": True,
                "data": payload,
                "editability": payload["editability"],
            },
            status=status.HTTP_200_OK,
        )

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        detail = ChartOfAccountDetailSerializer(
            self.get_object(),
            context=self.get_serializer_context(),
        )
        response.data = detail.data
        return response


class FinanceAccountViewSet(AdminAccountingModelViewSet):
    queryset = FinanceAccount.objects.select_related("chart_account", "branch").all()
    serializer_class = FinanceAccountSerializer
    pagination_class = AdminAccountingPagination
    search_fields = ["name", "upi_handle", "bank_last4", "chart_account__code"]
    ordering_fields = ["name", "kind", "created_at"]
    ordering = ["name", "id"]

    def get_queryset(self):
        from accounting.services.finance_account_collection_guard import (
            filter_finance_accounts_for_payment_collection,
        )

        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        kind = self.request.query_params.get("kind")
        branch_qp = self.request.query_params.get("branch")
        branch_id_for_counter: int | None = None
        if branch_qp not in (None, ""):
            try:
                branch_id_for_counter = int(branch_qp)
            except (TypeError, ValueError):
                branch_id_for_counter = None

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active in {"1", "true", "TRUE", "yes", "YES"})
        if kind:
            queryset = queryset.filter(kind=kind.strip().upper())
        _truthy = {"1", "true", "TRUE", "yes", "YES"}
        if self.request.query_params.get("for_cash_counter") in _truthy:
            from accounting.services.finance_account_collection_guard import filter_finance_accounts_for_cash_counter

            queryset = filter_finance_accounts_for_cash_counter(queryset, branch_id=branch_id_for_counter)
        elif branch_qp:
            queryset = queryset.filter(branch_id=branch_qp)
        if self.request.query_params.get("for_payment_collection") in _truthy:
            queryset = filter_finance_accounts_for_payment_collection(queryset)
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return FinanceAccountDetailSerializer
        if self.action == "partial_update":
            return FinanceAccountUpdateSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["get"], url_path="editability")
    def editability(self, request, pk=None):
        account = self.get_object()
        payload = FinanceAccountDetailSerializer(
            account,
            context=self.get_serializer_context(),
        ).data
        return Response(
            {
                "success": True,
                "data": payload,
                "editability": payload["editability"],
            },
            status=status.HTTP_200_OK,
        )

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        detail = FinanceAccountDetailSerializer(
            self.get_object(),
            context=self.get_serializer_context(),
        )
        response.data = detail.data
        return response


class JournalEntryViewSet(AdminAccountingModelViewSet):
    queryset = (
        JournalEntry.objects.select_related("financial_year", "accounting_period")
        .prefetch_related("lines", "lines__chart_account")
        .all()
    )
    serializer_class = JournalEntrySerializer
    search_fields = ["entry_no", "memo", "source_model", "source_id"]
    ordering_fields = ["entry_date", "created_at", "entry_no"]
    ordering = ["-entry_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        source_type = self.request.query_params.get("source_type")
        voucher_type = self.request.query_params.get("voucher_type")
        status_value = self.request.query_params.get("status")
        if source_type:
            queryset = queryset.filter(source_type=source_type.strip().upper())
        if voucher_type:
            queryset = queryset.filter(voucher_type=voucher_type.strip().upper())
        if status_value:
            queryset = queryset.filter(status=status_value.strip().upper())
        return queryset

    def get_serializer_class(self):
        if self.action == "post_entry":
            return JournalEntryPostSerializer
        if self.action == "void_entry":
            return JournalEntryVoidSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="post")
    def post_entry(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            journal_entry, updated = post_journal_entry(
                journal_entry_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = JournalEntrySerializer(journal_entry, context=self.get_serializer_context())
        return Response(
            {
                "updated": updated,
                "journal_entry": payload.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="void")
    @require_capability("accounting.reverse_entry")
    def void_entry(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            journal_entry, updated = void_journal_entry(
                journal_entry_id=int(pk),
                performed_by=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = JournalEntrySerializer(journal_entry, context=self.get_serializer_context())
        return Response(
            {
                "updated": updated,
                "journal_entry": payload.data,
            },
            status=status.HTTP_200_OK,
        )


class VendorViewSet(AdminAccountingModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    search_fields = ["name", "phone", "email", "gstin"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active in {"1", "true", "TRUE", "yes", "YES"})
        return queryset

    @action(detail=True, methods=["get"], url_path="operational-summary")
    def operational_summary(self, request, pk=None):
        return Response(
            build_vendor_operational_summary(self.get_object()),
            status=status.HTTP_200_OK,
        )


class ExpenseVoucherViewSet(AdminAccountingModelViewSet):
    queryset = ExpenseVoucher.objects.select_related(
        "vendor",
        "expense_account",
        "finance_account",
        "posted_journal_entry",
    ).all()
    serializer_class = ExpenseVoucherSerializer
    search_fields = ["voucher_no", "vendor__name", "bill_no", "notes"]
    ordering_fields = ["expense_date", "created_at", "voucher_no"]
    ordering = ["-expense_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get("branch")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_expense"}:
            return EmptyActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            voucher, updated = approve_expense_voucher(
                expense_voucher_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = ExpenseVoucherSerializer(voucher, context=self.get_serializer_context())
        return Response({"updated": updated, "expense": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="post")
    def post_expense(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            voucher, updated = post_expense_voucher(
                expense_voucher_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = ExpenseVoucherSerializer(voucher, context=self.get_serializer_context())
        return Response({"updated": updated, "expense": payload.data}, status=status.HTTP_200_OK)


class EmployeeProfileViewSet(AdminAccountingModelViewSet):
    queryset = EmployeeProfile.objects.prefetch_related("compensation_components").all()
    serializer_class = EmployeeProfileSerializer
    search_fields = ["employee_code", "name", "phone", "designation", "department"]
    ordering_fields = ["employee_code", "name", "joining_date", "department"]
    ordering = ["name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        department = (self.request.query_params.get("department") or "").strip()
        branch_id = self.request.query_params.get("branch")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active in {"1", "true", "TRUE", "yes", "YES"})
        if department:
            queryset = queryset.filter(department__iexact=department)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class EmployeeAttendanceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "head", "options"]
    queryset = EmployeeAttendance.objects.select_related("employee", "recorded_by", "leave_request").all()
    serializer_class = EmployeeAttendanceSerializer
    search_fields = ["employee__employee_code", "employee__name", "employee__department", "notes"]
    ordering_fields = ["attendance_date", "created_at"]
    ordering = ["-attendance_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        attendance_date = self.request.query_params.get("attendance_date")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if attendance_date:
            queryset = queryset.filter(attendance_date=attendance_date)
        if date_from:
            queryset = queryset.filter(attendance_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(attendance_date__lte=date_to)
        return queryset


class PayrollPeriodViewSet(AdminAccountingModelViewSet):
    queryset = PayrollPeriod.objects.select_related("closed_by").all()
    serializer_class = PayrollPeriodSerializer
    search_fields = ["code"]
    ordering_fields = ["year", "month", "start_date"]
    ordering = ["-year", "-month", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset

    def get_serializer_class(self):
        if self.action == "close_period":
            return PayrollPeriodCloseSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="close")
    def close_period(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payroll_period, updated = close_payroll_period(
                payroll_period_id=int(pk),
                close_reason=serializer.validated_data.get("close_reason", ""),
                closed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PayrollPeriodSerializer(payroll_period, context=self.get_serializer_context())
        return Response({"updated": updated, "payroll_period": payload.data}, status=status.HTTP_200_OK)


class LeaveTypeViewSet(AdminAccountingModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active in {"1", "true", "TRUE", "yes", "YES"})
        return queryset


class LeaveRequestViewSet(AdminAccountingModelViewSet):
    queryset = LeaveRequest.objects.select_related(
        "employee",
        "leave_type",
        "approved_by",
        "rejected_by",
        "cancelled_by",
    ).all()
    serializer_class = LeaveRequestSerializer
    search_fields = ["request_no", "employee__employee_code", "employee__name", "reason", "notes"]
    ordering_fields = ["start_date", "end_date", "created_at"]
    ordering = ["-start_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        leave_type_id = self.request.query_params.get("leave_type")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if leave_type_id:
            queryset = queryset.filter(leave_type_id=leave_type_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "reject", "cancel_request"}:
            return LeaveRequestActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            leave_request, updated = approve_leave_request(
                leave_request_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = LeaveRequestSerializer(leave_request, context=self.get_serializer_context())
        return Response({"updated": updated, "leave_request": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            leave_request, updated = reject_leave_request(
                leave_request_id=int(pk),
                rejection_reason=serializer.validated_data.get("reason", ""),
                rejected_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = LeaveRequestSerializer(leave_request, context=self.get_serializer_context())
        return Response({"updated": updated, "leave_request": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_request(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            leave_request, updated = cancel_leave_request(
                leave_request_id=int(pk),
                cancel_reason=serializer.validated_data.get("reason", ""),
                cancelled_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = LeaveRequestSerializer(leave_request, context=self.get_serializer_context())
        return Response({"updated": updated, "leave_request": payload.data}, status=status.HTTP_200_OK)


class SalarySheetViewSet(AdminAccountingModelViewSet):
    queryset = SalarySheet.objects.select_related(
        "employee",
        "posted_journal_entry",
        "payroll_period",
    ).prefetch_related("salary_payments", "lines").all()
    serializer_class = SalarySheetSerializer
    search_fields = ["employee__employee_code", "employee__name"]
    ordering_fields = ["year", "month", "created_at"]
    ordering = ["-year", "-month", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        payroll_period_id = self.request.query_params.get("payroll_period")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if payroll_period_id:
            queryset = queryset.filter(payroll_period_id=payroll_period_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_salary"}:
            return EmptyActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            salary_sheet, updated = approve_salary_sheet(
                salary_sheet_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = SalarySheetSerializer(salary_sheet, context=self.get_serializer_context())
        return Response({"updated": updated, "salary_sheet": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="post")
    def post_salary(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            salary_sheet, updated = post_salary_sheet(
                salary_sheet_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = SalarySheetSerializer(salary_sheet, context=self.get_serializer_context())
        return Response({"updated": updated, "salary_sheet": payload.data}, status=status.HTTP_200_OK)


class SalaryPaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "head", "options"]
    queryset = SalaryPayment.objects.select_related(
        "salary_sheet",
        "salary_sheet__employee",
        "finance_account",
        "posted_journal_entry",
    ).all()
    serializer_class = SalaryPaymentSerializer
    search_fields = ["salary_sheet__employee__employee_code", "salary_sheet__employee__name", "reference_no"]
    ordering_fields = ["payment_date", "created_at"]
    ordering = ["-payment_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        salary_sheet_id = self.request.query_params.get("salary_sheet")
        finance_account_id = self.request.query_params.get("finance_account")
        branch_id = self.request.query_params.get("branch")
        if salary_sheet_id:
            queryset = queryset.filter(salary_sheet_id=salary_sheet_id)
        employee_id = self.request.query_params.get("employee")
        if employee_id:
            queryset = queryset.filter(salary_sheet__employee_id=employee_id)
        if finance_account_id:
            queryset = queryset.filter(finance_account_id=finance_account_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class StaffAdvanceViewSet(AdminAccountingModelViewSet):
    queryset = StaffAdvance.objects.select_related("employee", "finance_account", "posted_journal_entry", "approved_by").prefetch_related("recoveries", "recoveries__finance_account", "recoveries__posted_journal_entry").all()
    serializer_class = StaffAdvanceSerializer
    search_fields = ["employee__employee_code", "employee__name", "reason", "reference_no"]
    ordering = ["-request_date", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get("employee"):
            queryset = queryset.filter(employee_id=self.request.query_params["employee"])
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        from accounting.services.staff_advance_service import approve_staff_advance
        try:
            row = approve_staff_advance(staff_advance_id=int(pk), performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(self.get_serializer(row).data)

    @action(detail=True, methods=["post"])
    def disburse(self, request, pk=None):
        from datetime import date
        from accounting.services.staff_advance_service import disburse_staff_advance
        try:
            account = FinanceAccount.objects.get(pk=request.data.get("finance_account"))
            row = disburse_staff_advance(
                staff_advance_id=int(pk), finance_account=account,
                disbursement_date=date.fromisoformat(str(request.data.get("disbursement_date"))),
                reference_no=str(request.data.get("reference_no") or ""), performed_by=request.user,
            )
        except (FinanceAccount.DoesNotExist, TypeError, ValueError) as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(self.get_serializer(row).data)

    @action(detail=True, methods=["post"])
    def recover(self, request, pk=None):
        from datetime import date
        from accounting.services.staff_advance_service import recover_staff_advance
        try:
            account = FinanceAccount.objects.get(pk=request.data.get("finance_account"))
            recover_staff_advance(
                staff_advance_id=int(pk), amount=request.data.get("amount"), finance_account=account,
                recovery_date=date.fromisoformat(str(request.data.get("recovery_date"))),
                reference_no=str(request.data.get("reference_no") or ""), performed_by=request.user,
            )
            row = self.get_queryset().get(pk=pk)
        except (FinanceAccount.DoesNotExist, TypeError, ValueError) as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(self.get_serializer(row).data)


class EmployeeExpenseClaimViewSet(AdminAccountingModelViewSet):
    queryset = EmployeeExpenseClaim.objects.select_related(
        "employee",
        "expense_account",
        "posted_journal_entry",
        "approved_by",
        "rejected_by",
    ).prefetch_related("payments").all()
    serializer_class = EmployeeExpenseClaimSerializer
    search_fields = ["claim_no", "employee__employee_code", "employee__name", "bill_no", "notes"]
    ordering_fields = ["claim_date", "expense_date", "created_at"]
    ordering = ["-claim_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get("employee")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        branch_id = self.request.query_params.get("branch")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "reject", "post_claim"}:
            return EmployeeExpenseClaimActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim, updated = approve_employee_expense_claim(
                expense_claim_id=int(pk),
                approved_amount=serializer.validated_data.get("approved_amount"),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = EmployeeExpenseClaimSerializer(claim, context=self.get_serializer_context())
        return Response({"updated": updated, "expense_claim": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim, updated = reject_employee_expense_claim(
                expense_claim_id=int(pk),
                rejection_reason=serializer.validated_data.get("reason", ""),
                rejected_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = EmployeeExpenseClaimSerializer(claim, context=self.get_serializer_context())
        return Response({"updated": updated, "expense_claim": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="post")
    def post_claim(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim, updated = post_employee_expense_claim(
                expense_claim_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = EmployeeExpenseClaimSerializer(claim, context=self.get_serializer_context())
        return Response({"updated": updated, "expense_claim": payload.data}, status=status.HTTP_200_OK)


class EmployeeExpenseClaimPaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "head", "options"]
    queryset = EmployeeExpenseClaimPayment.objects.select_related(
        "expense_claim",
        "expense_claim__employee",
        "finance_account",
        "posted_journal_entry",
    ).all()
    serializer_class = EmployeeExpenseClaimPaymentSerializer
    search_fields = ["expense_claim__claim_no", "expense_claim__employee__name", "reference_no"]
    ordering_fields = ["payment_date", "created_at"]
    ordering = ["-payment_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        expense_claim_id = self.request.query_params.get("expense_claim")
        employee_id = self.request.query_params.get("employee")
        branch_id = self.request.query_params.get("branch")
        if expense_claim_id:
            queryset = queryset.filter(expense_claim_id=expense_claim_id)
        if employee_id:
            queryset = queryset.filter(expense_claim__employee_id=employee_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class AttendanceCalendarView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        employee_id = request.query_params.get("employee")
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if not employee_id or not year or not month:
            raise ValidationError({"detail": "employee, year, and month are required."})
        return Response(
            build_attendance_calendar(
                employee_id=int(employee_id),
                year=int(year),
                month=int(month),
            )
        )


class StaffLedgerView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        employee_id = request.query_params.get("employee")
        branch_id = request.query_params.get("branch")
        return Response(
            build_staff_ledger(
                employee_id=int(employee_id) if employee_id else None,
                branch_id=int(branch_id) if branch_id else None,
            )
        )


class MoneyMovementViewSet(AdminAccountingModelViewSet):
    queryset = MoneyMovement.objects.select_related(
        "from_finance_account",
        "to_finance_account",
        "posted_journal_entry",
    ).all()
    serializer_class = MoneyMovementSerializer
    search_fields = ["movement_no", "reference_no", "notes"]
    ordering_fields = ["movement_date", "created_at", "movement_no"]
    ordering = ["-movement_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action == "post_movement":
            return EmptyActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="post")
    def post_movement(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            movement, updated = post_money_movement(
                money_movement_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        payload = MoneyMovementSerializer(movement, context=self.get_serializer_context())
        return Response({"updated": updated, "money_movement": payload.data}, status=status.HTTP_200_OK)


class AccountingValidationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = AccountingValidationQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = validate_financial_period_balance(
            date_from=serializer.validated_data.get("date_from"),
            date_to=serializer.validated_data.get("date_to"),
        )
        return Response(payload, status=status.HTTP_200_OK)


class JournalGroupBalanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        group = JournalEntryGroup.objects.get(pk=pk)
        return Response(validate_journal_group_balance(group), status=status.HTTP_200_OK)


class JournalGroupReverseView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @require_capability("accounting.reverse_entry")
    def post(self, request, pk):
        serializer = JournalGroupReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reversal_group, created = reverse_journal_group(
                journal_group_id=int(pk),
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            {
                "created": created,
                "journal_group_id": reversal_group.id,
                "journal_group_code": reversal_group.journal_group_id,
                "reversal_of": reversal_group.reversal_of_id,
            },
            status=status.HTTP_200_OK,
        )
