from __future__ import annotations

from rest_framework import serializers

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    Asset,
    AssetCategory,
    DepreciationLine,
    DepreciationRun,
    PostingLock,
    VendorSettlement,
)


class PeriodActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class AccountingPeriodSerializer(serializers.ModelSerializer):
    locked_by_username = serializers.CharField(source="locked_by.username", read_only=True)

    class Meta:
        model = AccountingPeriod
        fields = [
            "id",
            "code",
            "label",
            "start_date",
            "end_date",
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
            "created_at",
            "updated_at",
        ]


class AccountingBookQuerySerializer(serializers.Serializer):
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
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    purchase_bill_no = serializers.CharField(source="purchase_bill.bill_no", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = VendorSettlement
        fields = [
            "id",
            "settlement_no",
            "vendor",
            "vendor_name",
            "settlement_date",
            "amount",
            "finance_account",
            "finance_account_name",
            "reference_no",
            "purchase_bill",
            "purchase_bill_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "settlement_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]


class AccountingBridgePostingSerializer(serializers.ModelSerializer):
    journal_entry_no = serializers.CharField(source="journal_entry.entry_no", read_only=True)
    journal_entry_status = serializers.CharField(source="journal_entry.status", read_only=True)
    journal_entry_date = serializers.DateField(source="journal_entry.entry_date", read_only=True)
    journal_entry_memo = serializers.CharField(source="journal_entry.memo", read_only=True)

    class Meta:
        model = AccountingBridgePosting
        fields = [
            "id",
            "source_model",
            "source_id",
            "purpose",
            "voucher_type",
            "source_type",
            "source_reference",
            "source_document_no",
            "source_event_date",
            "trace_metadata",
            "journal_entry",
            "journal_entry_no",
            "journal_entry_status",
            "journal_entry_date",
            "journal_entry_memo",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
