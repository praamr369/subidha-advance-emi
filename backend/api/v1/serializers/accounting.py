from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    CompensationComponentType,
    EmployeeAttendance,
    EmployeeCompensationComponent,
    EmployeeExpenseClaim,
    EmployeeExpenseClaimPayment,
    EmployeeProfile,
    EmployeeDocument,
    ExpenseVoucher,
    ExpenseClaimStatus,
    ExpenseVoucherStatus,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
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
from accounting.services.finance_account_readiness import (
    chart_account_is_posting_ready,
    finance_account_readiness,
)
from accounting.services.master_edit_service import (
    AccountingMasterUpdateService,
    get_chart_account_editability,
    get_finance_account_editability,
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


class JournalGroupReverseSerializer(serializers.Serializer):
    reason = serializers.CharField()


class AccountingValidationQuerySerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

class ChartOfAccountSerializer(serializers.ModelSerializer):
    parent_code = serializers.CharField(source="parent.code", read_only=True)
    superseded_by_code = serializers.CharField(source="superseded_by.code", read_only=True)
    superseded_by_name = serializers.CharField(source="superseded_by.name", read_only=True)
    notes = serializers.CharField(required=False, allow_blank=True)

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
            "is_legacy",
            "legacy_reason",
            "superseded_by",
            "superseded_by_code",
            "superseded_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "system_code",
            "is_legacy",
            "legacy_reason",
            "superseded_by",
        ]


class ChartOfAccountCreateSerializer(serializers.ModelSerializer):
    """Admin manual create: no client-supplied system_code (reserved for bootstrap / imports)."""

    code = serializers.CharField(required=False, allow_blank=True, max_length=30)
    notes = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ChartOfAccount
        fields = [
            "code",
            "name",
            "account_type",
            "parent",
            "is_active",
            "allow_manual_posting",
            "notes",
        ]

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate(self, attrs):
        attrs = super().validate(attrs)
        raw_code = attrs.get("code", "") or ""
        cleaned_code = raw_code.strip().upper()
        if cleaned_code:
            if ChartOfAccount.objects.filter(code=cleaned_code).exists():
                raise serializers.ValidationError({"code": "An account with this code already exists."})
            attrs["code"] = cleaned_code
        else:
            attrs.pop("code", None)

        parent = attrs.get("parent")
        account_type = attrs["account_type"]
        if parent and parent.account_type != account_type:
            raise serializers.ValidationError(
                {"parent": "Parent account must have the same account type as the new account."}
            )
        return attrs

    def create(self, validated_data):
        return ChartOfAccount.objects.create(**validated_data)


class ChartOfAccountDetailSerializer(ChartOfAccountSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)
    child_count = serializers.SerializerMethodField()
    finance_account_count = serializers.SerializerMethodField()
    editability = serializers.SerializerMethodField()

    class Meta(ChartOfAccountSerializer.Meta):
        fields = ChartOfAccountSerializer.Meta.fields + [
            "parent_name",
            "child_count",
            "finance_account_count",
            "editability",
        ]

    def get_child_count(self, obj):
        return obj.children.count()

    def get_finance_account_count(self, obj):
        return obj.finance_accounts.count()

    def get_editability(self, obj):
        return get_chart_account_editability(obj)


class ChartOfAccountUpdateSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField(required=False, allow_blank=True)
    account_type = serializers.ChoiceField(
        choices=ChartOfAccountType.choices,
        required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    system_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = ChartOfAccount
        fields = [
            "code",
            "name",
            "account_type",
            "parent",
            "is_active",
            "allow_manual_posting",
            "system_code",
            "notes",
        ]

    def validate_code(self, value):
        return (value or "").strip().upper()

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate_system_code(self, value):
        return (value or "").strip().upper() or None

    def validate_notes(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance is None:
            return attrs
        try:
            AccountingMasterUpdateService.validate_chart_account_update(
                account=instance,
                payload=attrs,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs

    def update(self, instance, validated_data):
        updated = AccountingMasterUpdateService.update_chart_account(
            account=instance,
            payload=validated_data,
            actor=getattr(self.context.get("request"), "user", None),
        )
        updated.refresh_from_db()
        return updated


class FinanceAccountSerializer(serializers.ModelSerializer):
    chart_account_code = serializers.CharField(source="chart_account.code", read_only=True)
    chart_account_name = serializers.CharField(source="chart_account.name", read_only=True)
    mapped_chart_account_id = serializers.IntegerField(source="chart_account_id", read_only=True)
    mapped_chart_account_code = serializers.CharField(source="chart_account.code", read_only=True)
    mapped_chart_account_name = serializers.CharField(source="chart_account.name", read_only=True)
    mapped_chart_account_type = serializers.CharField(source="chart_account.account_type", read_only=True)
    mapped_chart_account_is_posting = serializers.SerializerMethodField()
    collection_ready = serializers.SerializerMethodField()
    collection_blocker_reason = serializers.SerializerMethodField()
    recommended_action = serializers.SerializerMethodField()
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def _readiness(self, obj):
        cached = getattr(obj, "_collection_readiness", None)
        if cached is None:
            cached = finance_account_readiness(obj)
            setattr(obj, "_collection_readiness", cached)
        return cached

    def get_mapped_chart_account_is_posting(self, obj):
        return chart_account_is_posting_ready(getattr(obj, "chart_account", None))

    def get_collection_ready(self, obj):
        return self._readiness(obj).collection_ready

    def get_collection_blocker_reason(self, obj):
        return self._readiness(obj).collection_blocker_reason

    def get_recommended_action(self, obj):
        return self._readiness(obj).recommended_action

    def validate(self, attrs):
        attrs = super().validate(attrs)
        chart = attrs.get("chart_account")
        if chart is None:
            return attrs
        is_settlement = attrs.get("is_real_settlement_account")
        if is_settlement is None:
            is_settlement = True
        if is_settlement and chart.account_type != ChartOfAccountType.ASSET:
            raise serializers.ValidationError(
                {
                    "chart_account": (
                        "Cash, bank, and UPI settlement finance accounts must link to an ASSET chart account."
                    )
                }
            )
        return attrs

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
            "mapped_chart_account_id",
            "mapped_chart_account_code",
            "mapped_chart_account_name",
            "mapped_chart_account_type",
            "mapped_chart_account_is_posting",
            "collection_ready",
            "collection_blocker_reason",
            "recommended_action",
            "opening_balance",
            "is_real_settlement_account",
            "is_active",
            "bank_last4",
            "upi_handle",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FinanceAccountDetailSerializer(FinanceAccountSerializer):
    editability = serializers.SerializerMethodField()

    class Meta(FinanceAccountSerializer.Meta):
        fields = FinanceAccountSerializer.Meta.fields + [
            "editability",
        ]

    def get_editability(self, obj):
        return get_finance_account_editability(obj)


class FinanceAccountUpdateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = FinanceAccount
        fields = [
            "name",
            "kind",
            "chart_account",
            "opening_balance",
            "is_real_settlement_account",
            "is_active",
            "bank_last4",
            "upi_handle",
            "notes",
        ]

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate_bank_last4(self, value):
        return (value or "").strip()

    def validate_upi_handle(self, value):
        return (value or "").strip()

    def validate_notes(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance is None:
            return attrs
        try:
            AccountingMasterUpdateService.validate_finance_account_update(
                account=instance,
                payload=attrs,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs

    def update(self, instance, validated_data):
        updated = AccountingMasterUpdateService.update_finance_account(
            account=instance,
            payload=validated_data,
            actor=getattr(self.context.get("request"), "user", None),
        )
        updated.refresh_from_db()
        return updated


class FinanceAccountCoaMappingSerializer(serializers.ModelSerializer):
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    finance_account_kind = serializers.CharField(source="finance_account.kind", read_only=True)
    finance_account_is_real_settlement_account = serializers.BooleanField(source="finance_account.is_real_settlement_account", read_only=True)
    chart_account_name = serializers.CharField(source="chart_account.name", read_only=True)
    chart_account_code = serializers.CharField(source="chart_account.code", read_only=True)
    chart_account_type = serializers.CharField(source="chart_account.account_type", read_only=True)
    chart_account_is_posting = serializers.SerializerMethodField()

    class Meta:
        model = FinanceAccountCoaMapping
        fields = [
            "id",
            "finance_account",
            "finance_account_name",
            "finance_account_kind",
            "finance_account_is_real_settlement_account",
            "chart_account",
            "chart_account_code",
            "chart_account_name",
            "chart_account_type",
            "chart_account_is_posting",
            "purpose",
            "is_default",
            "is_active",
            "notes",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "updated_by", "created_at", "updated_at"]

    def get_chart_account_is_posting(self, obj):
        return chart_account_is_posting_ready(getattr(obj, "chart_account", None))

    def validate_purpose(self, value):
        if value not in FinanceAccountMappingPurpose.values:
            raise serializers.ValidationError("Invalid mapping purpose.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        payload = {
            "finance_account": attrs.get("finance_account", getattr(instance, "finance_account", None)),
            "chart_account": attrs.get("chart_account", getattr(instance, "chart_account", None)),
            "purpose": attrs.get("purpose", getattr(instance, "purpose", None)),
            "is_default": attrs.get("is_default", getattr(instance, "is_default", False)),
            "is_active": attrs.get("is_active", getattr(instance, "is_active", True)),
            "notes": attrs.get("notes", getattr(instance, "notes", "")),
            "created_by": getattr(instance, "created_by", None),
            "updated_by": attrs.get("updated_by", getattr(instance, "updated_by", None)),
        }
        candidate = instance or FinanceAccountCoaMapping(**payload)
        if instance is not None:
            for field, value in payload.items():
                setattr(candidate, field, value)
        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return attrs

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
            "employment_type",
            "salary_effective_from",
            "temporary_contract_end_date",
            "daily_wage_rate",
            "hourly_wage_rate",
            "piece_rate_amount",
            "piece_rate_unit_label",
            "kyc_id_type",
            "kyc_id_number",
            "kyc_verified",
            "address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "cost_center_code",
            "payroll_expense_account",
            "is_active",
            "notes",
            "compensation_components",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "employee_code", "created_at", "updated_at"]


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_code",
            "document_type",
            "title",
            "document_no",
            "file",
            "file_url",
            "status",
            "notes",
            "uploaded_by",
            "uploaded_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "uploaded_by",
            "uploaded_by_username",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        try:
            url = obj.file.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url


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
