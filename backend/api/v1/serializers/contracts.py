from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from subscriptions.models import (
    ContractReturnConditionStatus,
    Customer,
    DocumentVerificationStatus,
    MONEY_ZERO,
    Product,
    Subscription,
    SubscriptionDocumentType,
)


class AdminRentContractCreateSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    tenure_months = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField(required=False)
    security_deposit_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    handover_notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    contract_terms_snapshot = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Additive: when true the contract is created as DRAFT (KYC gate not applied).
    save_as_draft = serializers.BooleanField(required=False, default=False)

    def validate_start_date(self, value):
        return value or timezone.localdate()

    def validate_security_deposit_percent(self, value):
        if value < Decimal("20.00") or value > Decimal("30.00"):
            raise serializers.ValidationError("Security deposit percent must be between 20 and 30.")
        return value


class AdminLeaseContractCreateSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    tenure_months = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField(required=False)
    security_deposit_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    buyout_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    ownership_transfer_allowed = serializers.BooleanField(required=False, default=False)
    handover_notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    contract_terms_snapshot = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Additive: when true the contract is created as DRAFT (KYC gate not applied).
    save_as_draft = serializers.BooleanField(required=False, default=False)

    def validate_start_date(self, value):
        return value or timezone.localdate()

    def validate_security_deposit_percent(self, value):
        if value < Decimal("20.00") or value > Decimal("30.00"):
            raise serializers.ValidationError("Security deposit percent must be between 20 and 30.")
        return value

    def validate_buyout_amount(self, value):
        if value is None:
            return None
        if value < MONEY_ZERO:
            raise serializers.ValidationError("Buyout amount cannot be negative.")
        return value


class SubscriptionDocumentUploadSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=SubscriptionDocumentType.choices)
    file = serializers.FileField()
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    verification_status = serializers.ChoiceField(
        choices=DocumentVerificationStatus.choices,
        required=False,
        default=DocumentVerificationStatus.PENDING,
    )

    def validate(self, attrs):
        subscription: Subscription = self.context["subscription"]
        document_type = attrs["document_type"]

        if subscription.plan_type not in ("RENT", "LEASE"):
            raise serializers.ValidationError(
                {"subscription": "Document uploads are supported only for RENT/LEASE contracts."}
            )

        if subscription.plan_type == "RENT" and document_type == "LEASE_CONTRACT_PDF":
            raise serializers.ValidationError({"document_type": "LEASE contract PDF not valid for a RENT contract."})

        if subscription.plan_type == "LEASE" and document_type == "RENT_CONTRACT_PDF":
            raise serializers.ValidationError({"document_type": "RENT contract PDF not valid for a LEASE contract."})

        return attrs


class ContractReturnAssessmentSerializer(serializers.Serializer):
    return_condition_status = serializers.ChoiceField(choices=ContractReturnConditionStatus.choices)
    deduction_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_deduction_amount(self, value):
        if value < MONEY_ZERO:
            raise serializers.ValidationError("Deduction amount cannot be negative.")
        return value

