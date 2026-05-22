from __future__ import annotations

from rest_framework import serializers
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
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
