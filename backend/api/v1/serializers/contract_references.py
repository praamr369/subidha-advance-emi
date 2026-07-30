from __future__ import annotations

from decimal import Decimal

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


# Selectable instruments (UI). Legacy BANK/CARD still accepted for compatibility
# with older clients/records, but not offered in the dropdowns.
PAYMENT_METHOD_CHOICES = ["CASH", "UPI", "TRANSFER", "CHEQUE", "DEPOSIT", "BANK", "CARD"]


class CollectionSplitSerializer(serializers.Serializer):
    """One tender line of a split collection (e.g. ₹60 CASH + ₹40 UPI)."""

    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(choices=PAYMENT_METHOD_CHOICES)
    finance_account_id = serializers.IntegerField(min_value=1)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)


class UnifiedReceivableCollectSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(
        choices=[*ContractReferenceType.choices, ("LEGACY_RECEIVABLE", "Legacy Receivable")]
    )
    source_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(choices=PAYMENT_METHOD_CHOICES)
    splits = CollectionSplitSerializer(many=True, required=False)
    finance_account = serializers.IntegerField(required=False, min_value=1)
    finance_account_id = serializers.IntegerField(required=False, min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    payment_date = serializers.DateField(required=False, allow_null=True)
    receipt_date = serializers.DateField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=160)
    contract_reference_id = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        splits = attrs.get("splits") or []
        if splits:
            total = sum((split["amount"] for split in splits), start=0)
            if total != attrs["amount"]:
                raise serializers.ValidationError(
                    {"splits": "Split amounts must add up exactly to the total collection amount."}
                )
            if attrs["source_type"] == "LEGACY_RECEIVABLE":
                raise serializers.ValidationError(
                    {"splits": "Legacy receivables require a single full settlement and cannot be split."}
                )
            # The header method/account mirror the first tender for compatibility.
            attrs["payment_method"] = splits[0]["payment_method"]
            attrs.setdefault("finance_account_id", splits[0]["finance_account_id"])
            attrs["finance_account"] = attrs.get("finance_account") or splits[0]["finance_account_id"]
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
        attrs["payment_date"] = attrs.get("payment_date") or attrs.get("receipt_date") or None
        attrs["idempotency_key"] = (attrs.get("idempotency_key") or "").strip() or None
        crid = attrs.get("contract_reference_id")
        attrs["contract_reference_id"] = int(crid) if crid else None
        return attrs


class UnifiedReceivablePreviewSerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=ContractReferenceType.choices)
    source_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
