from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillLine,
    StockLocation,
    StockAdjustment,
    StockAdjustmentLine,
    StockAdjustmentStatus,
    StockLedger,
)
from inventory.services.stock_service import generate_stock_adjustment_number
from inventory.services.stock_service import upsert_purchase_bill_draft


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0.000")).quantize(Decimal("0.001"))


class EmptyInventoryActionSerializer(serializers.Serializer):
    pass


class InventoryItemSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    current_stock_qty = serializers.SerializerMethodField()
    default_stock_location_code = serializers.CharField(source="default_stock_location.code", read_only=True)
    default_stock_location_name = serializers.CharField(source="default_stock_location.name", read_only=True)

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "product",
            "product_code",
            "product_name",
            "sku",
            "unit_of_measure",
            "default_stock_location",
            "default_stock_location_code",
            "default_stock_location_name",
            "stock_tracking_enabled",
            "stock_item_type",
            "delivery_stock_bridge_enabled",
            "opening_stock_qty",
            "reorder_level_qty",
            "valuation_method",
            "standard_unit_cost",
            "is_active",
            "current_stock_qty",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "current_stock_qty", "created_at", "updated_at"]

    def get_current_stock_qty(self, obj):
        return f"{obj.current_stock_quantity():.3f}"


class StockLedgerSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="inventory_item.product.product_code", read_only=True)
    product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)

    class Meta:
        model = StockLedger
        fields = [
            "id",
            "inventory_item",
            "product_code",
            "product_name",
            "movement_type",
            "quantity_in",
            "quantity_out",
            "movement_date",
            "stock_location",
            "stock_location_code",
            "stock_location_name",
            "reference_model",
            "reference_id",
            "warehouse_name",
            "notes",
            "posted_by",
            "posted_by_username",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class StockAdjustmentLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = StockAdjustmentLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "product_name",
            "quantity_delta",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def _replace_stock_adjustment_lines(adjustment: StockAdjustment, lines: list[dict]):
    adjustment.lines.all().delete()
    StockAdjustmentLine.objects.bulk_create(
        [StockAdjustmentLine(stock_adjustment=adjustment, **line) for line in lines]
    )


class StockAdjustmentSerializer(serializers.ModelSerializer):
    adjustment_no = serializers.CharField(required=False, allow_blank=True)
    lines = StockAdjustmentLineSerializer(many=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)

    class Meta:
        model = StockAdjustment
        fields = [
            "id",
            "adjustment_no",
            "adjustment_date",
            "status",
            "reason",
            "stock_location",
            "stock_location_code",
            "stock_location_name",
            "created_by",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_by",
            "posted_by_username",
            "posted_at",
            "posted_journal_entry",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "created_by",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_by",
            "posted_by_username",
            "posted_at",
            "posted_journal_entry",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != StockAdjustmentStatus.DRAFT:
            raise serializers.ValidationError("Only draft stock adjustments can be edited.")
        if not attrs.get("lines") and instance is None:
            raise serializers.ValidationError({"lines": "Stock adjustments require at least one line."})
        reason = attrs.get("reason", getattr(instance, "reason", ""))
        if not (reason or "").strip():
            raise serializers.ValidationError({"reason": "Reason is required for a stock adjustment."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        if not (validated_data.get("adjustment_no") or "").strip():
            validated_data["adjustment_no"] = generate_stock_adjustment_number(
                adjustment_date=validated_data.get("adjustment_date")
            )
        adjustment = StockAdjustment.objects.create(**validated_data)
        _replace_stock_adjustment_lines(adjustment, lines)
        return adjustment

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            _replace_stock_adjustment_lines(instance, lines)
        return instance


class PurchaseBillLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    inventory_item_stock_item_type = serializers.CharField(source="inventory_item.stock_item_type", read_only=True)
    inventory_item_unit_of_measure = serializers.CharField(source="inventory_item.unit_of_measure", read_only=True)

    class Meta:
        model = PurchaseBillLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "inventory_item_stock_item_type",
            "inventory_item_unit_of_measure",
            "description",
            "quantity",
            "unit_cost",
            "taxable_value",
            "tax_amount",
            "line_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PurchaseBillSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    lines = PurchaseBillLineSerializer(many=True, required=False)

    class Meta:
        model = PurchaseBill
        fields = [
            "id",
            "bill_no",
            "bill_date",
            "vendor",
            "vendor_name",
            "branch",
            "branch_code",
            "branch_name",
            "tax_mode",
            "status",
            "subtotal",
            "tax_total",
            "grand_total",
            "stock_location",
            "stock_location_code",
            "stock_location_name",
            "finance_account",
            "finance_account_name",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != "DRAFT":
            raise serializers.ValidationError("Only draft purchase bills can be edited.")
        if not (attrs.get("lines") or (instance and self.initial_data.get("lines") is None)):
            raise serializers.ValidationError({"lines": "At least one purchase bill line is required."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        request = self.context.get("request")
        return upsert_purchase_bill_draft(
            lines=lines,
            performed_by=getattr(request, "user", None),
            **validated_data,
        )

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        payload = {
            "bill_no": validated_data.get("bill_no", instance.bill_no),
            "bill_date": validated_data.get("bill_date", instance.bill_date),
            "vendor": validated_data.get("vendor", instance.vendor),
            "branch": validated_data.get("branch", instance.branch),
            "tax_mode": validated_data.get("tax_mode", instance.tax_mode),
            "stock_location": validated_data.get("stock_location", instance.stock_location),
            "finance_account": validated_data.get("finance_account", instance.finance_account),
            "notes": validated_data.get("notes", instance.notes),
            "lines": lines if lines is not None else list(instance.lines.select_related("inventory_item").all().values()),
            "purchase_bill_id": instance.id,
            "performed_by": getattr(self.context.get("request"), "user", None),
        }
        if lines is None:
            payload["lines"] = [
                {
                    "inventory_item": line.inventory_item,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_cost": line.unit_cost,
                    "taxable_value": line.taxable_value,
                    "tax_amount": line.tax_amount,
                    "line_total": line.line_total,
                }
                for line in instance.lines.select_related("inventory_item").all()
            ]
        return upsert_purchase_bill_draft(**payload)


class StockLocationSerializer(serializers.ModelSerializer):
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = StockLocation
        fields = [
            "id",
            "code",
            "name",
            "branch",
            "branch_code",
            "branch_name",
            "location_type",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class OpeningStockImportPreviewSerializer(serializers.Serializer):
    as_of_date = serializers.DateField(required=False)


class OpeningStockImportPostSerializer(serializers.Serializer):
    as_of_date = serializers.DateField(required=True)
