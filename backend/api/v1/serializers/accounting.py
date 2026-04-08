from rest_framework import serializers

from accounting.models import (
    ChartOfAccount,
    ExpenseVoucher,
    ExpenseVoucherStatus,
    FinanceAccount,
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
    MoneyMovement,
    MoneyMovementStatus,
    SalarySheet,
    SalarySheetStatus,
    Vendor,
    EmployeeProfile,
)
from accounting.services.journal_posting_service import (
    create_journal_entry,
    update_draft_journal_entry,
)


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

    class Meta:
        model = FinanceAccount
        fields = [
            "id",
            "name",
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


class EmployeeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeProfile
        fields = [
            "id",
            "employee_code",
            "name",
            "joining_date",
            "base_salary",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "employee_code", "created_at", "updated_at"]


class SalarySheetSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )
    payment_total = serializers.SerializerMethodField()

    class Meta:
        model = SalarySheet
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_code",
            "year",
            "month",
            "gross_amount",
            "deductions_amount",
            "net_amount",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "payment_total",
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

    def get_payment_total(self, obj):
        total = sum(payment.amount for payment in obj.salary_payments.all())
        return f"{total:.2f}"


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

