from decimal import Decimal

from rest_framework import serializers

from accounting.models import (
    ChartOfAccount,
    CompensationComponentType,
    EmployeeAttendance,
    EmployeeCompensationComponent,
    EmployeeExpenseClaim,
    EmployeeExpenseClaimPayment,
    EmployeeProfile,
    ExpenseVoucher,
    ExpenseClaimStatus,
    ExpenseVoucherStatus,
    FinanceAccount,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
    LeaveRequest,
    LeaveRequestStatus,
    LeaveType,
    MoneyMovement,
    MoneyMovementStatus,
    PayrollPeriod,
    PayrollPeriodStatus,
    SalaryPayment,
    SalarySheetLine,
    SalarySheet,
    SalarySheetStatus,
    Vendor,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    update_draft_journal_entry,
)
from accounting.services.salary_posting_service import post_salary_payment
from accounting.services.workforce_service import (
    approve_employee_expense_claim,
    approve_leave_request,
    build_staff_ledger,
    cancel_leave_request,
    close_payroll_period,
    post_employee_expense_claim,
    post_employee_expense_claim_payment,
    reject_employee_expense_claim,
    reject_leave_request,
    replace_employee_compensation_components,
    upsert_employee_attendance,
    upsert_employee_expense_claim_draft,
    upsert_leave_request_draft,
    upsert_salary_sheet_draft,
)
from crm.services.party_service import sync_party_for_employee, sync_party_for_vendor


class EmptyActionSerializer(serializers.Serializer):
    pass


class JournalEntryPostSerializer(serializers.Serializer):
    pass


class JournalEntryVoidSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ChartOfAccountSerializer(serializers.ModelSerializer):
    parent_code = serializers.CharField(source="parent.code", read_only=True)

    class Meta:
        model = ChartOfAccount
        fields = [
            "id",
            "code",
            "name",
            "account_type",
            "parent",
            "parent_code",
            "is_active",
            "allow_manual_posting",
            "system_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FinanceAccountSerializer(serializers.ModelSerializer):
    chart_account_code = serializers.CharField(source="chart_account.code", read_only=True)
    chart_account_name = serializers.CharField(source="chart_account.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = FinanceAccount
        fields = [
            "id",
            "name",
            "branch",
            "branch_code",
            "branch_name",
            "kind",
            "chart_account",
            "chart_account_code",
            "chart_account_name",
            "opening_balance",
            "is_active",
            "bank_last4",
            "upi_handle",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class JournalEntryLineSerializer(serializers.ModelSerializer):
    chart_account_code = serializers.CharField(source="chart_account.code", read_only=True)
    chart_account_name = serializers.CharField(source="chart_account.name", read_only=True)

    class Meta:
        model = JournalEntryLine
        fields = [
            "id",
            "chart_account",
            "chart_account_code",
            "chart_account_name",
            "description",
            "debit_amount",
            "credit_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalEntryLineSerializer(many=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id",
            "entry_no",
            "entry_date",
            "entry_type",
            "status",
            "memo",
            "voucher_type",
            "source_type",
            "source_reference",
            "source_model",
            "source_id",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_by",
            "posted_by_username",
            "posted_at",
            "void_reason",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "entry_no",
            "status",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_by",
            "posted_by_username",
            "posted_at",
            "void_reason",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)

        if instance is None:
            if attrs.get("entry_type") != JournalEntryType.MANUAL:
                raise serializers.ValidationError(
                    {"entry_type": "Only manual journal entries can be created directly."}
                )
        elif instance.status != JournalEntryStatus.DRAFT:
            raise serializers.ValidationError(
                "Only draft journal entries can be edited."
            )

        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        return create_journal_entry(lines=lines, **validated_data)

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        updated = update_draft_journal_entry(
            journal_entry_id=instance.id,
            entry_date=validated_data.get("entry_date"),
            memo=validated_data.get("memo"),
            lines=lines,
        )
        updated.refresh_from_db()
        return updated


class VendorSerializer(serializers.ModelSerializer):
    def create(self, validated_data):
        vendor = super().create(validated_data)
        request = self.context.get("request")
        sync_party_for_vendor(vendor, performed_by=getattr(request, "user", None))
        return vendor

    def update(self, instance, validated_data):
        vendor = super().update(instance, validated_data)
        request = self.context.get("request")
        sync_party_for_vendor(vendor, performed_by=getattr(request, "user", None))
        return vendor

    class Meta:
        model = Vendor
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "address",
            "gstin",
            "state_code",
            "state_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ExpenseVoucherSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    expense_account_code = serializers.CharField(
        source="expense_account.code",
        read_only=True,
    )
    expense_account_name = serializers.CharField(
        source="expense_account.name",
        read_only=True,
    )
    finance_account_name = serializers.CharField(
        source="finance_account.name",
        read_only=True,
    )
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )

    class Meta:
        model = ExpenseVoucher
        fields = [
            "id",
            "voucher_no",
            "expense_date",
            "vendor",
            "vendor_name",
            "branch",
            "branch_code",
            "branch_name",
            "expense_account",
            "expense_account_code",
            "expense_account_name",
            "gross_amount",
            "tax_amount",
            "net_amount",
            "payment_mode",
            "finance_account",
            "finance_account_name",
            "status",
            "bill_no",
            "bill_date",
            "notes",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "voucher_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status == ExpenseVoucherStatus.POSTED:
            raise serializers.ValidationError("Posted expense vouchers cannot be edited.")
        return attrs


class EmployeeCompensationComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeCompensationComponent
        fields = [
            "id",
            "component_name",
            "component_type",
            "amount",
            "sort_order",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EmployeeProfileSerializer(serializers.ModelSerializer):
    compensation_components = EmployeeCompensationComponentSerializer(many=True, required=False)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    def create(self, validated_data):
        components = validated_data.pop("compensation_components", [])
        employee = super().create(validated_data)
        replace_employee_compensation_components(employee=employee, components=components)
        request = self.context.get("request")
        sync_party_for_employee(employee, performed_by=getattr(request, "user", None))
        return employee

    def update(self, instance, validated_data):
        components = validated_data.pop("compensation_components", None)
        employee = super().update(instance, validated_data)
        if components is not None:
            replace_employee_compensation_components(employee=employee, components=components)
        request = self.context.get("request")
        sync_party_for_employee(employee, performed_by=getattr(request, "user", None))
        return employee

    class Meta:
        model = EmployeeProfile
        fields = [
            "id",
            "employee_code",
            "name",
            "phone",
            "branch",
            "branch_code",
            "branch_name",
            "designation",
            "department",
            "joining_date",
            "base_salary",
            "standard_daily_hours",
            "overtime_rate_per_hour",
            "is_active",
            "notes",
            "compensation_components",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "employee_code", "created_at", "updated_at"]


class PayrollPeriodSerializer(serializers.ModelSerializer):
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True)

    class Meta:
        model = PayrollPeriod
        fields = [
            "id",
            "code",
            "year",
            "month",
            "start_date",
            "end_date",
            "status",
            "closed_at",
            "closed_by",
            "closed_by_username",
            "close_reason",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "code",
            "status",
            "closed_at",
            "closed_by",
            "closed_by_username",
            "close_reason",
            "created_at",
            "updated_at",
        ]


class PayrollPeriodCloseSerializer(serializers.Serializer):
    close_reason = serializers.CharField(required=False, allow_blank=True)


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            "id",
            "code",
            "name",
            "is_paid",
            "annual_allowance_days",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LeaveRequestActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    approved_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    leave_type_name = serializers.CharField(source="leave_type.name", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    rejected_by_username = serializers.CharField(source="rejected_by.username", read_only=True)
    cancelled_by_username = serializers.CharField(source="cancelled_by.username", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "request_no",
            "employee",
            "employee_name",
            "employee_code",
            "leave_type",
            "leave_type_name",
            "start_date",
            "end_date",
            "day_count",
            "status",
            "reason",
            "notes",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "rejected_by",
            "rejected_by_username",
            "rejected_at",
            "rejection_reason",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "request_no",
            "status",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "rejected_by",
            "rejected_by_username",
            "rejected_at",
            "rejection_reason",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != LeaveRequestStatus.DRAFT:
            raise serializers.ValidationError("Only draft leave requests can be edited.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return upsert_leave_request_draft(
                payload=validated_data,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    def update(self, instance, validated_data):
        request = self.context.get("request")
        try:
            return upsert_leave_request_draft(
                payload=validated_data,
                leave_request_id=instance.id,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc


class SalarySheetLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalarySheetLine
        fields = [
            "id",
            "component_name",
            "component_type",
            "source_type",
            "source_reference",
            "quantity",
            "rate",
            "amount",
            "sort_order",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SalarySheetSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_phone = serializers.CharField(source="employee.phone", read_only=True)
    employee_designation = serializers.CharField(source="employee.designation", read_only=True)
    employee_department = serializers.CharField(source="employee.department", read_only=True)
    payroll_period_code = serializers.CharField(source="payroll_period.code", read_only=True)
    payroll_period_status = serializers.CharField(source="payroll_period.status", read_only=True)
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )
    payment_total = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    lines = SalarySheetLineSerializer(many=True, required=False)
    auto_generate = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = SalarySheet
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_code",
            "employee_phone",
            "employee_designation",
            "employee_department",
            "payroll_period",
            "payroll_period_code",
            "payroll_period_status",
            "year",
            "month",
            "gross_amount",
            "deductions_amount",
            "net_amount",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
            "outstanding_amount",
            "lines",
            "auto_generate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
            "outstanding_amount",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status in {
            SalarySheetStatus.POSTED,
            SalarySheetStatus.PAID_PARTIAL,
            SalarySheetStatus.PAID,
        }:
            raise serializers.ValidationError("Posted salary sheets cannot be edited.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return upsert_salary_sheet_draft(
                payload=validated_data,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    def update(self, instance, validated_data):
        request = self.context.get("request")
        try:
            return upsert_salary_sheet_draft(
                payload=validated_data,
                salary_sheet_id=instance.id,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    def get_payment_total(self, obj):
        total = sum(payment.amount for payment in obj.salary_payments.all())
        return f"{total:.2f}"

    def get_outstanding_amount(self, obj):
        total = sum(payment.amount for payment in obj.salary_payments.all())
        outstanding = obj.net_amount - total
        return f"{outstanding:.2f}"


class SalaryPaymentSerializer(serializers.ModelSerializer):
    salary_sheet_employee_name = serializers.CharField(source="salary_sheet.employee.name", read_only=True)
    salary_sheet_employee_code = serializers.CharField(source="salary_sheet.employee.employee_code", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = SalaryPayment
        fields = [
            "id",
            "salary_sheet",
            "salary_sheet_employee_name",
            "salary_sheet_employee_code",
            "payment_date",
            "amount",
            "branch",
            "branch_code",
            "branch_name",
            "finance_account",
            "finance_account_name",
            "reference_no",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return post_salary_payment(
                salary_sheet_id=validated_data["salary_sheet"].id,
                payment_date=validated_data["payment_date"],
                amount=validated_data["amount"],
                finance_account_id=validated_data["finance_account"].id,
                reference_no=validated_data.get("reference_no", ""),
                posted_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc


class EmployeeAttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_department = serializers.CharField(source="employee.department", read_only=True)
    leave_request_no = serializers.CharField(source="leave_request.request_no", read_only=True)
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = EmployeeAttendance
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_code",
            "employee_department",
            "attendance_date",
            "status",
            "worked_hours",
            "overtime_hours",
            "leave_request",
            "leave_request_no",
            "notes",
            "recorded_by",
            "recorded_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "recorded_by",
            "recorded_by_username",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            attendance, _ = upsert_employee_attendance(
                employee=validated_data["employee"],
                attendance_date=validated_data["attendance_date"],
                status=validated_data["status"],
                worked_hours=validated_data.get("worked_hours", "0.00"),
                overtime_hours=validated_data.get("overtime_hours", "0.00"),
                leave_request=validated_data.get("leave_request"),
                notes=validated_data.get("notes", ""),
                recorded_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return attendance


class EmployeeExpenseClaimActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    approved_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class EmployeeExpenseClaimPaymentSerializer(serializers.ModelSerializer):
    expense_claim_no = serializers.CharField(source="expense_claim.claim_no", read_only=True)
    employee_name = serializers.CharField(source="expense_claim.employee.name", read_only=True)
    employee_code = serializers.CharField(source="expense_claim.employee.employee_code", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = EmployeeExpenseClaimPayment
        fields = [
            "id",
            "expense_claim",
            "expense_claim_no",
            "employee_name",
            "employee_code",
            "payment_date",
            "amount",
            "branch",
            "branch_code",
            "branch_name",
            "finance_account",
            "finance_account_name",
            "reference_no",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "expense_claim_no",
            "employee_name",
            "employee_code",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return post_employee_expense_claim_payment(
                expense_claim_id=validated_data["expense_claim"].id,
                payment_date=validated_data["payment_date"],
                amount=validated_data["amount"],
                finance_account_id=validated_data["finance_account"].id,
                reference_no=validated_data.get("reference_no", ""),
                posted_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc


class EmployeeExpenseClaimSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    expense_account_code = serializers.CharField(source="expense_account.code", read_only=True)
    expense_account_name = serializers.CharField(source="expense_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    payment_total = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    payments = EmployeeExpenseClaimPaymentSerializer(many=True, read_only=True)

    class Meta:
        model = EmployeeExpenseClaim
        fields = [
            "id",
            "claim_no",
            "employee",
            "employee_name",
            "employee_code",
            "claim_date",
            "expense_date",
            "branch",
            "branch_code",
            "branch_name",
            "category",
            "expense_account",
            "expense_account_code",
            "expense_account_name",
            "claimed_amount",
            "approved_amount",
            "status",
            "bill_no",
            "notes",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
            "outstanding_amount",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "claim_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
            "outstanding_amount",
            "payments",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != ExpenseClaimStatus.DRAFT:
            raise serializers.ValidationError("Only draft expense claims can be edited.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        try:
            return upsert_employee_expense_claim_draft(
                payload=validated_data,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    def update(self, instance, validated_data):
        request = self.context.get("request")
        try:
            return upsert_employee_expense_claim_draft(
                payload=validated_data,
                expense_claim_id=instance.id,
                performed_by=getattr(request, "user", None),
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    def get_payment_total(self, obj):
        total = sum(payment.amount for payment in obj.payments.all())
        return f"{total:.2f}"

    def get_outstanding_amount(self, obj):
        total = sum(payment.amount for payment in obj.payments.all())
        outstanding = (obj.approved_amount or Decimal("0.00")) - total
        return f"{outstanding:.2f}"


class MoneyMovementSerializer(serializers.ModelSerializer):
    from_finance_account_name = serializers.CharField(
        source="from_finance_account.name",
        read_only=True,
    )
    to_finance_account_name = serializers.CharField(
        source="to_finance_account.name",
        read_only=True,
    )
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )

    class Meta:
        model = MoneyMovement
        fields = [
            "id",
            "movement_no",
            "movement_date",
            "from_finance_account",
            "from_finance_account_name",
            "to_finance_account",
            "to_finance_account_name",
            "amount",
            "reference_no",
            "notes",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "movement_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status == MoneyMovementStatus.POSTED:
            raise serializers.ValidationError("Posted money movements cannot be edited.")
        return attrs
