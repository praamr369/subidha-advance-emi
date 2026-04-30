from __future__ import annotations

from rest_framework import serializers

from subscriptions.models import ContractReference, ContractReferenceType


def mask_phone(value: str | None) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{'*' * (len(digits) - 4)}{digits[-4:]}"


class ContractReferenceSerializer(serializers.ModelSerializer):
    phone_masked = serializers.SerializerMethodField()
    source_type = serializers.CharField(source="contract_type", read_only=True)
    source_id = serializers.SerializerMethodField()
    customer_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.CharField(source="customer_name_snapshot", read_only=True)
    product_summary = serializers.CharField(source="product_summary_snapshot", read_only=True)

    class Meta:
        model = ContractReference
        fields = [
            "id",
            "source_type",
            "source_id",
            "reference_no",
            "display_reference",
            "customer_id",
            "customer_name",
            "phone_masked",
            "product_summary",
            "batch_snapshot",
            "lucky_id_snapshot",
            "partner_snapshot",
            "source_created_at",
            "created_at",
            "updated_at",
        ]

    def get_phone_masked(self, obj):
        return mask_phone(obj.phone_snapshot)

    def get_source_id(self, obj):
        return obj.direct_sale_id or obj.subscription_id or obj.invoice_id


class UnifiedReceivableCollectSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=ContractReferenceType.choices)
    source_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(choices=["CASH", "UPI", "BANK"])
    finance_account = serializers.IntegerField(required=False, min_value=1)
    finance_account_id = serializers.IntegerField(required=False, min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    payment_date = serializers.DateField(required=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=160)
    contract_reference_id = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        finance_account_id = attrs.get("finance_account_id") or attrs.get("finance_account")
        if not finance_account_id:
            raise serializers.ValidationError(
                {"finance_account": "finance_account is required."}
            )
        attrs["finance_account_id"] = finance_account_id
        attrs["reference_no"] = (
            attrs.get("reference_no") or attrs.get("reference") or ""
        ).strip() or None
        attrs["note"] = (attrs.get("note") or attrs.get("notes") or "").strip() or None
        attrs["idempotency_key"] = (attrs.get("idempotency_key") or "").strip() or None
        crid = attrs.get("contract_reference_id")
        attrs["contract_reference_id"] = int(crid) if crid else None
        return attrs


class UnifiedReceivablePreviewSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=ContractReferenceType.choices)
    source_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
