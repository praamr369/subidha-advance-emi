from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class CashierPaymentCollectionSerializer(serializers.Serializer):
    emi_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.CharField(required=False, allow_blank=True, max_length=10)
    finance_account_id = serializers.IntegerField(min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    note = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=160)

    def validate_amount(self, value):
        if _money(value) <= Decimal("0.00"):
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return _money(value)

    def validate_method(self, value):
        method = (value or "CASH").strip().upper()
        if method not in {"CASH", "UPI", "BANK"}:
            raise serializers.ValidationError("Unsupported payment method.")
        return method


class CashierAdvanceCollectionSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.CharField(required=False, allow_blank=True, max_length=10)
    finance_account_id = serializers.IntegerField(min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    note = serializers.CharField(required=False, allow_blank=True)
    payment_date = serializers.DateField(required=False)

    def validate_amount(self, value):
        if _money(value) <= Decimal("0.00"):
            raise serializers.ValidationError("Advance amount must be greater than zero.")
        return _money(value)

    def validate_method(self, value):
        method = (value or "CASH").strip().upper()
        if method not in {"CASH", "UPI", "BANK"}:
            raise serializers.ValidationError("Unsupported payment method.")
        return method


class AdminAdvanceAllocationSerializer(serializers.Serializer):
    customer_advance_id = serializers.IntegerField(min_value=1)
    emi_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    note = serializers.CharField(required=False, allow_blank=True)
    allocation_date = serializers.DateField(required=False)

    def validate_amount(self, value):
        if _money(value) <= Decimal("0.00"):
            raise serializers.ValidationError("Allocation amount must be greater than zero.")
        return _money(value)


class FinanceTransferCreateSerializer(serializers.Serializer):
    movement_date = serializers.DateField()
    from_finance_account_id = serializers.IntegerField(min_value=1)
    to_finance_account_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if _money(value) <= Decimal("0.00"):
            raise serializers.ValidationError("Transfer amount must be greater than zero.")
        return _money(value)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs["from_finance_account_id"] == attrs["to_finance_account_id"]:
            raise serializers.ValidationError(
                {"to_finance_account_id": "Source and destination finance accounts must be different."}
            )
        return attrs
