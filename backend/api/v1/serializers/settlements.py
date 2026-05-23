from __future__ import annotations

from rest_framework import serializers
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    CashierDayClose,
    SettlementAllocation,
    SettlementAllocationSourceType,
    UpiSettlementImport,
    UpiSettlementLine,
)

class BankStatementLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatementLine
        fields = [
            "id",
            "statement_import",
            "transaction_date",
            "value_date",
            "description",
            "reference_no",
            "debit",
            "credit",
            "balance",
            "raw_payload",
            "normalized_reference",
            "matched_status",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class BankStatementImportSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    bank_finance_account_name = serializers.CharField(source="bank_finance_account.name", read_only=True)

    class Meta:
        model = BankStatementImport
        fields = [
            "id",
            "import_no",
            "bank_finance_account",
            "bank_finance_account_name",
            "statement_period_from",
            "statement_period_to",
            "uploaded_file",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "status",
            "checksum",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "import_no",
            "uploaded_by",
            "uploaded_at",
            "status",
            "checksum",
            "metadata",
            "created_at",
            "updated_at",
        ]


class BankStatementImportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatementImport
        fields = [
            "id",
            "bank_finance_account",
            "statement_period_from",
            "statement_period_to",
            "uploaded_file",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        p_from = attrs.get("statement_period_from")
        p_to = attrs.get("statement_period_to")
        if p_from and p_to and p_to < p_from:
            raise serializers.ValidationError(
                {"statement_period_to": "Statement period end cannot be earlier than start."}
            )
        file = attrs.get("uploaded_file")
        if not file:
            raise serializers.ValidationError({"uploaded_file": "File is required."})
        return attrs


class UpiSettlementLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = UpiSettlementLine
        fields = [
            "id",
            "settlement_import",
            "transaction_ref",
            "payment_ref",
            "gross_amount",
            "fee_amount",
            "net_amount",
            "settlement_date",
            "raw_payload",
            "matched_status",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class UpiSettlementImportSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)
    upi_finance_account_name = serializers.CharField(source="upi_finance_account.name", read_only=True)

    class Meta:
        model = UpiSettlementImport
        fields = [
            "id",
            "import_no",
            "upi_finance_account",
            "upi_finance_account_name",
            "settlement_date",
            "uploaded_file",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "status",
            "checksum",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "import_no",
            "uploaded_by",
            "uploaded_at",
            "status",
            "checksum",
            "metadata",
            "created_at",
            "updated_at",
        ]


class UpiSettlementImportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UpiSettlementImport
        fields = [
            "id",
            "upi_finance_account",
            "settlement_date",
            "uploaded_file",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        file = attrs.get("uploaded_file")
        if not file:
            raise serializers.ValidationError({"uploaded_file": "File is required."})
        return attrs


class SettlementAllocationSerializer(serializers.ModelSerializer):
    matched_by_username = serializers.CharField(source="matched_by.username", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)

    class Meta:
        model = SettlementAllocation
        fields = [
            "id",
            "source_type",
            "source_id",
            "finance_account",
            "finance_account_name",
            "matched_amount",
            "status",
            "payment",
            "receipt",
            "money_movement",
            "matched_by",
            "matched_by_username",
            "matched_at",
            "confidence",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SettlementAllocationCreateSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=SettlementAllocationSourceType.choices)
    source_id = serializers.CharField()
    finance_account = serializers.IntegerField()
    matched_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment = serializers.IntegerField(required=False, allow_null=True)
    receipt = serializers.IntegerField(required=False, allow_null=True)
    money_movement = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not (attrs.get("payment") or attrs.get("receipt") or attrs.get("money_movement")):
            raise serializers.ValidationError({"payment": "At least one target (payment, receipt, money_movement) is required."})
        if attrs.get("matched_amount") is not None and attrs["matched_amount"] <= 0:
            raise serializers.ValidationError({"matched_amount": "matched_amount must be greater than zero."})
        return attrs


class SettlementAllocationVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


# === Cashier Day Close Serializers ===


class CashierDayCloseSerializer(serializers.ModelSerializer):
    """Read-only detail serializer for cashier day-close records."""
    cashier_username = serializers.CharField(source="cashier.username", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True, allow_null=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, allow_null=True)
    cash_counter_name = serializers.CharField(source="cash_counter.name", read_only=True, allow_null=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True, allow_null=True)
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True, allow_null=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True, allow_null=True)

    class Meta:
        model = CashierDayClose
        fields = [
            "id",
            "close_no",
            "cashier",
            "cashier_username",
            "branch",
            "branch_code",
            "branch_name",
            "cash_counter",
            "cash_counter_name",
            "finance_account",
            "finance_account_name",
            "business_date",
            "opening_cash",
            "system_cash_total",
            "counted_cash",
            "variance",
            "status",
            "closed_by",
            "closed_by_username",
            "closed_at",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "notes",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CashierDayCloseCreateSerializer(serializers.Serializer):
    """Serializer for creating a new cashier day-close draft."""
    business_date = serializers.DateField()
    counted_cash = serializers.DecimalField(max_digits=12, decimal_places=2)
    branch = serializers.IntegerField(required=False, allow_null=True)
    cash_counter = serializers.IntegerField(required=False, allow_null=True)
    finance_account = serializers.IntegerField(required=False, allow_null=True)
    opening_cash = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default="0.00")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("counted_cash") is not None and attrs["counted_cash"] < 0:
            raise serializers.ValidationError({"counted_cash": "Counted cash cannot be negative."})
        return attrs


class CashierDayCloseSubmitSerializer(serializers.Serializer):
    """Serializer for submitting a cashier day-close (DRAFT → SUBMITTED)."""
    # No input fields; just accept the submission request


class CashierDayCloseApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval of a day-close (SUBMITTED → APPROVED)."""
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CashierDayCloseRejectSerializer(serializers.Serializer):
    """Serializer for admin rejection of a day-close (SUBMITTED → REJECTED)."""
    notes = serializers.CharField(required=True, allow_blank=False)

    def validate_notes(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Rejection notes are required and cannot be empty.")
        return value.strip()
