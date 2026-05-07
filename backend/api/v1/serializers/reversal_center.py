from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from billing.models import RefundMethod


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)


class DirectSaleReturnCreateLineSerializer(serializers.Serializer):
    direct_sale_line_id = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))


class DirectSaleReturnCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)
    lines = DirectSaleReturnCreateLineSerializer(many=True)


class CustomerRefundCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=RefundMethod.choices)
    finance_account_id = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(required=True, allow_blank=False)
    direct_sale_return_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class PurchaseReturnCreateLineSerializer(serializers.Serializer):
    purchase_bill_line_id = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))


class PurchaseReturnCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)
    lines = PurchaseReturnCreateLineSerializer(many=True)


class ReversalListFilterSerializer(serializers.Serializer):
    type = serializers.CharField(required=False)
    status = serializers.CharField(required=False)
    customer = serializers.IntegerField(required=False, min_value=1)
    vendor = serializers.IntegerField(required=False, min_value=1)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    amount_min = serializers.DecimalField(required=False, max_digits=12, decimal_places=2)
    amount_max = serializers.DecimalField(required=False, max_digits=12, decimal_places=2)
    reference = serializers.CharField(required=False)
