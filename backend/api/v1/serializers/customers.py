"""
Serializers for Phase 1 Customer Creation, KYC, Referral endpoints.

These are separate from admin_resources.CustomerAdminSerializer to allow
email-optional quick-create without breaking existing admin create flow.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from subscriptions.models import (
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerKycDocumentType,
    CustomerReferral,
    CustomerSource,
    KycStatus,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared mini-serializer for customer search / selector results
# ---------------------------------------------------------------------------

class CustomerSearchSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    customer_source = serializers.CharField(read_only=True)
    customer_code = serializers.CharField(read_only=True)
    gstin = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            "id",
            "name",
            "phone",
            "email",
            "address",
            "city",
            "kyc_status",
            "status",
            "customer_source",
            "customer_code",
            "gstin",
            "created_at",
        )
        read_only_fields = fields

    def get_email(self, obj):
        return (getattr(obj.user, "email", "") or "").strip()

    def get_status(self, obj):
        return "ACTIVE" if getattr(obj.user, "is_active", False) else "INACTIVE"

    def get_gstin(self, obj):
        latest_direct_sale_gstin = (
            obj.direct_sales.exclude(customer_gstin__isnull=True)
            .exclude(customer_gstin__exact="")
            .order_by("-id")
            .values_list("customer_gstin", flat=True)
            .first()
        )
        if latest_direct_sale_gstin:
            return latest_direct_sale_gstin
        latest_invoice_gstin = (
            obj.billing_invoices.exclude(customer_gstin__isnull=True)
            .exclude(customer_gstin__exact="")
            .order_by("-id")
            .values_list("customer_gstin", flat=True)
            .first()
        )
        return latest_invoice_gstin or ""


# ---------------------------------------------------------------------------
# Quick-Create  (email optional – shop direct-sale flow)
# ---------------------------------------------------------------------------

class CustomerQuickCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=15)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    source = serializers.ChoiceField(
        choices=CustomerSource.choices,
        default=CustomerSource.ADMIN,
        required=False,
    )

    def validate_phone(self, value):
        from subscriptions.services.customer_service import normalize_phone
        try:
            return normalize_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_name(self, value):
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("Customer name is required.")
        return v


# ---------------------------------------------------------------------------
# KYC Document Upload (customer self-service)
# ---------------------------------------------------------------------------

class CustomerKycDocumentUploadSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=CustomerKycDocumentType.choices)
    file = serializers.FileField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CustomerKycDocumentReadSerializer(serializers.ModelSerializer):
    reviewed_by_username = serializers.SerializerMethodField()

    class Meta:
        model = CustomerKycDocument
        fields = (
            "id",
            "customer",
            "document_type",
            "file",
            "notes",
            "status",
            "reviewed_by_username",
            "reviewed_at",
            "rejection_reason",
            "created_at",
        )
        read_only_fields = fields

    def get_reviewed_by_username(self, obj):
        return getattr(obj.reviewed_by, "username", None) if obj.reviewed_by_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.file and request:
            data["file"] = request.build_absolute_uri(instance.file.url)
        elif instance.file:
            data["file"] = instance.file.url
        else:
            data["file"] = None
        return data


# ---------------------------------------------------------------------------
# Referral
# ---------------------------------------------------------------------------

class CustomerReferralReadSerializer(serializers.ModelSerializer):
    referred_name = serializers.SerializerMethodField()
    referred_phone = serializers.SerializerMethodField()
    referrer_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomerReferral
        fields = (
            "id",
            "referrer",
            "referrer_name",
            "referred",
            "referred_name",
            "referred_phone",
            "notes",
            "commission_enabled",
            "commission_amount",
            "commission_approved",
            "commission_approved_at",
            "created_at",
        )
        read_only_fields = fields

    def get_referred_name(self, obj):
        return getattr(obj.referred, "name", "") if obj.referred_id else ""

    def get_referred_phone(self, obj):
        return getattr(obj.referred, "phone", "") if obj.referred_id else ""

    def get_referrer_name(self, obj):
        return getattr(obj.referrer, "name", "") if obj.referrer_id else ""


class CustomerReferralCreateSerializer(serializers.Serializer):
    referred_customer_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_referred_customer_id(self, value):
        if not Customer.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Referred customer not found.")
        return value


# ---------------------------------------------------------------------------
# Admin KYC Decision (extended to support APPROVED + backward-compat VERIFIED)
# ---------------------------------------------------------------------------

ADMIN_KYC_DECISION_CHOICES = [
    (KycStatus.APPROVED, "Approved"),
    (KycStatus.VERIFIED, "Verified (legacy alias)"),
    (KycStatus.REJECTED, "Rejected"),
    (KycStatus.PENDING, "Reset to Pending"),
    (KycStatus.SUBMITTED, "Mark as Submitted"),
]


class CustomerKycDecisionV2Serializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ADMIN_KYC_DECISION_CHOICES)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    document_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["status"] == KycStatus.REJECTED and not (attrs.get("reason") or "").strip():
            raise serializers.ValidationError({"reason": "Rejection reason is required when rejecting KYC."})
        return attrs
