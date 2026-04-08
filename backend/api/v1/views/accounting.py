from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounting.models import (
    ChartOfAccount,
    ExpenseVoucher,
    FinanceAccount,
    JournalEntry,
    MoneyMovement,
    SalarySheet,
    Vendor,
    EmployeeProfile,
)
from accounting.services.expense_posting_service import (
    approve_expense_voucher,
    post_expense_voucher,
)
from accounting.services.journal_posting_service import (
    post_journal_entry,
    void_journal_entry,
)
from accounting.services.money_movement_service import post_money_movement
from accounting.services.salary_posting_service import (
    approve_salary_sheet,
    post_salary_sheet,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting import (
    ChartOfAccountSerializer,
    EmptyActionSerializer,
    EmployeeProfileSerializer,
    ExpenseVoucherSerializer,
    FinanceAccountSerializer,
    JournalEntryPostSerializer,
    JournalEntrySerializer,
    JournalEntryVoidSerializer,
    MoneyMovementSerializer,
    SalarySheetSerializer,
    VendorSerializer,
)


class AdminAccountingModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class ChartOfAccountViewSet(AdminAccountingModelViewSet):
    queryset = ChartOfAccount.objects.select_related("parent").all()
    serializer_class = ChartOfAccountSerializer
    search_fields = ["code", "name", "system_code"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code", "id"]


class FinanceAccountViewSet(AdminAccountingModelViewSet):
    queryset = FinanceAccount.objects.select_related("chart_account").all()
    serializer_class = FinanceAccountSerializer
    search_fields = ["name", "upi_handle", "bank_last4", "chart_account__code"]
    ordering_fields = ["name", "kind", "created_at"]
    ordering = ["name", "id"]


class JournalEntryViewSet(AdminAccountingModelViewSet):
    queryset = JournalEntry.objects.prefetch_related("lines", "lines__chart_account").all()
    serializer_class = JournalEntrySerializer
    search_fields = ["entry_no", "memo", "source_model", "source_id"]
    ordering_fields = ["entry_date", "created_at", "entry_no"]
    ordering = ["-entry_date", "-created_at", "-id"]

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
    queryset = EmployeeProfile.objects.all()
    serializer_class = EmployeeProfileSerializer
    search_fields = ["employee_code", "name"]
    ordering_fields = ["employee_code", "name", "joining_date"]
    ordering = ["name", "id"]


class SalarySheetViewSet(AdminAccountingModelViewSet):
    queryset = SalarySheet.objects.select_related(
        "employee",
        "posted_journal_entry",
    ).prefetch_related("salary_payments").all()
    serializer_class = SalarySheetSerializer
    search_fields = ["employee__employee_code", "employee__name"]
    ordering_fields = ["year", "month", "created_at"]
    ordering = ["-year", "-month", "-created_at", "-id"]

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

