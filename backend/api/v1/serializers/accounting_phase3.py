from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    AccountingPeriodStatus,
    Asset,
    AssetCategory,
    DepreciationLine,
    DepreciationRun,
    FinancialYear,
    PostingLock,
    VendorSettlement,
    VendorSettlementStatus,
)
from inventory.models import PurchaseBillStatus


class PeriodActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class FinancialYearSerializer(serializers.ModelSerializer):
    activated_by_username = serializers.CharField(source="activated_by.username", read_only=True)

    class Meta:
        model = FinancialYear
        fields = [
            "id",
            "code",
            "name",
            "start_date",
            "end_date",
            "is_active",
            "activated_at",
            "activated_by",
            "activated_by_username",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_active",
            "activated_at",
            "activated_by",
            "activated_by_username",
            "created_at",
            "updated_at",
        ]


class PeriodStatusActionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=AccountingPeriodStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)


class AccountingPeriodSerializer(serializers.ModelSerializer):
    locked_by_username = serializers.CharField(source="locked_by.username", read_only=True)
    financial_year_code = serializers.CharField(source="financial_year.code", read_only=True)
    financial_year_name = serializers.CharField(source="financial_year.name", read_only=True)

    class Meta:
        model = AccountingPeriod
        fields = [
            "id",
            "code",
            "label",
            "name",
            "start_date",
            "end_date",
            "financial_year",
            "financial_year_code",
            "financial_year_name",
            "status",
            "is_locked",
            "locked_at",
            "locked_by",
            "locked_by_username",
            "lock_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_locked",
            "locked_at",
            "locked_by",
            "locked_by_username",
            "lock_reason",
            "financial_year_code",
            "financial_year_name",
            "created_at",
            "updated_at",
        ]


class AccountingBookQuerySerializer(serializers.Serializer):
    branch_id = serializers.IntegerField(required=False, min_value=1)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "end_date must be on or after start_date."})
        return attrs


class Phase3BridgeRunSerializer(AccountingBookQuerySerializer):
    dry_run = serializers.BooleanField(required=False, default=False)


class CommissionPayoutBridgeRunSerializer(Phase3BridgeRunSerializer):
    posting_approved = serializers.BooleanField(required=False, default=False)


class PurchaseVendorBridgeRunSerializer(Phase3BridgeRunSerializer):
    posting_approved = serializers.BooleanField(required=False, default=False)


class MasterImportActionSerializer(serializers.Serializer):
    pass


class PostingLockSerializer(serializers.ModelSerializer):
    locked_by_username = serializers.CharField(source="locked_by.username", read_only=True)

    class Meta:
        model = PostingLock
        fields = [
            "id",
            "lock_date",
            "reason",
            "locked_by",
            "locked_by_username",
            "locked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "locked_by",
            "locked_by_username",
            "locked_at",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["locked_by"] = request.user
        return super().create(validated_data)


class AssetCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetCategory
        fields = [
            "id",
            "code",
            "name",
            "method",
            "useful_life_months",
            "rate_annual",
            "default_salvage",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AssetSerializer(serializers.ModelSerializer):
    category_code = serializers.CharField(source="category.code", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    purchase_bill_no = serializers.CharField(source="purchase_bill.bill_no", read_only=True)

    class Meta:
        model = Asset
        fields = [
            "id",
            "asset_code",
            "category",
            "category_code",
            "category_name",
            "description",
            "acquisition_date",
            "in_service_date",
            "cost_amount",
            "salvage_value",
            "accumulated_depreciation",
            "status",
            "vendor",
            "vendor_name",
            "purchase_bill",
            "purchase_bill_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "asset_code",
            "accumulated_depreciation",
            "created_at",
            "updated_at",
        ]


class DepreciationLineSerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source="asset.asset_code", read_only=True)
    asset_description = serializers.CharField(source="asset.description", read_only=True)
    journal_entry_no = serializers.CharField(source="journal_entry.entry_no", read_only=True)

    class Meta:
        model = DepreciationLine
        fields = [
            "id",
            "asset",
            "asset_code",
            "asset_description",
            "depreciation_amount",
            "journal_entry",
            "journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class DepreciationRunSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    lines = DepreciationLineSerializer(many=True, read_only=True)

    class Meta:
        model = DepreciationRun
        fields = [
            "id",
            "run_code",
            "period_start",
            "period_end",
            "status",
            "created_by",
            "created_by_username",
            "executed_at",
            "posted_at",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "run_code",
            "status",
            "created_by",
            "created_by_username",
            "executed_at",
            "posted_at",
            "lines",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class VendorSettlementSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    purchase_bill_no = serializers.CharField(source="purchase_bill.bill_no", read_only=True)
    journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = VendorSettlement
        fields = [
            "id",
            "settlement_no",
            "vendor",
            "vendor_name",
            "purchase_bill",
            "purchase_bill_no",
            "branch",
            "branch_code",
            "branch_name",
            "settlement_date",
            "amount",
            "finance_account",
            "finance_account_name",
            "reference_no",
            "status",
            "posted_journal_entry",
            "journal_entry_no",
            "posted_journal_entry_no",
            "notes",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        vendor = attrs.get("vendor") or getattr(instance, "vendor", None)
        purchase_bill = attrs.get("purchase_bill") if "purchase_bill" in attrs else getattr(instance, "purchase_bill", None)
        finance_account = attrs.get("finance_account") or getattr(instance, "finance_account", None)
        amount = attrs.get("amount") or getattr(instance, "amount", None)

        if purchase_bill is not None:
            if vendor is None or purchase_bill.vendor_id != vendor.id:
                raise serializers.ValidationError(
                    {"purchase_bill": "Selected purchase bill does not belong to the settlement vendor."}
                )
            if purchase_bill.status != PurchaseBillStatus.POSTED:
                raise serializers.ValidationError(
                    {"purchase_bill": "Only posted purchase bills can be settled."}
                )
            posted_total = VendorSettlement.objects.filter(
                purchase_bill_id=purchase_bill.id,
                status=VendorSettlementStatus.POSTED,
            )
            if instance is not None:
                posted_total = posted_total.exclude(pk=instance.pk)
            already_settled = posted_total.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            outstanding = Decimal(str(purchase_bill.grand_total)) - Decimal(str(already_settled))
            if amount is not None and Decimal(str(amount)) > outstanding:
                raise serializers.ValidationError(
                    {"amount": f"Amount exceeds purchase bill outstanding amount ({outstanding:.2f})."}
                )

        if finance_account is not None:
            if not finance_account.is_active:
                raise serializers.ValidationError(
                    {"finance_account": "Select an active finance account."}
                )
            if not finance_account.is_real_settlement_account:
                raise serializers.ValidationError(
                    {"finance_account": "Select a real cash, bank, UPI, or gateway settlement account."}
                )
        return attrs
        read_only_fields = [
            "id",
            "settlement_no",
            "status",
            "posted_journal_entry",
            "journal_entry_no",
            "created_at",
            "updated_at",
        ]


class AccountingBridgePostingSerializer(serializers.ModelSerializer):
    journal_entry_no = serializers.CharField(source="journal_entry.entry_no", read_only=True)

    class Meta:
        model = AccountingBridgePosting
        fields = [
            "id",
            "source_model",
            "source_id",
            "purpose",
            "journal_entry",
            "journal_entry_no",
            "source_type",
            "source_reference",
            "voucher_type",
            "trace_metadata",
            "created_at",
        ]
        read_only_fields = fields
