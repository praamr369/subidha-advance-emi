from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from inventory.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    InventoryItem,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseBill,
    PurchaseBillLine,
    StockLocation,
    StockAdjustment,
    StockAdjustmentLine,
    StockAdjustmentStatus,
    StockLedger,
    VendorBill,
    VendorBillLine,
    VendorContact,
    VendorPayment,
)
from inventory.services.stock_service import generate_stock_adjustment_number
from inventory.services.stock_service import upsert_purchase_bill_draft


def _quantity(value) -> Decimal:
    return Decimal(str(value or "0.000")).quantize(Decimal("0.001"))


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


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


class VendorContactSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)

    class Meta:
        model = VendorContact
        fields = [
            "id",
            "vendor",
            "vendor_name",
            "name",
            "designation",
            "phone",
            "email",
            "is_primary",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class VendorLiteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    gstin = serializers.CharField(allow_blank=True, allow_null=True)
    state_code = serializers.CharField(allow_blank=True, allow_null=True)
    state_name = serializers.CharField(allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField()


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "description",
            "quantity",
            "unit_cost",
            "tax_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    lines = PurchaseOrderLineSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_no",
            "po_date",
            "vendor",
            "vendor_name",
            "status",
            "expected_date",
            "branch",
            "stock_location",
            "stock_location_name",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != "DRAFT":
            raise serializers.ValidationError("Only draft purchase orders can be edited.")
        if not attrs.get("lines") and instance is None:
            raise serializers.ValidationError({"lines": "At least one purchase order line is required."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        PurchaseOrderLine.objects.bulk_create([PurchaseOrderLine(purchase_order=purchase_order, **line) for line in lines])
        return purchase_order

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            PurchaseOrderLine.objects.bulk_create([PurchaseOrderLine(purchase_order=instance, **line) for line in lines])
        return instance


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "purchase_order_line",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "quantity_received",
            "unit_cost",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class GoodsReceiptSerializer(serializers.ModelSerializer):
    purchase_order_no = serializers.CharField(source="purchase_order.po_no", read_only=True)
    vendor_name = serializers.CharField(source="purchase_order.vendor.name", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)
    lines = GoodsReceiptLineSerializer(many=True)

    class Meta:
        model = GoodsReceipt
        fields = [
            "id",
            "receipt_no",
            "receipt_date",
            "purchase_order",
            "purchase_order_no",
            "vendor_name",
            "status",
            "branch",
            "stock_location",
            "stock_location_name",
            "notes",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "posted_by", "posted_by_username", "created_at", "updated_at"]

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        receipt = GoodsReceipt.objects.create(**validated_data)
        GoodsReceiptLine.objects.bulk_create([GoodsReceiptLine(goods_receipt=receipt, **line) for line in lines])
        return receipt

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        if instance.status != "DRAFT":
            raise serializers.ValidationError("Only draft goods receipts can be edited.")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            GoodsReceiptLine.objects.bulk_create([GoodsReceiptLine(goods_receipt=instance, **line) for line in lines])
        return instance


class VendorBillLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = VendorBillLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
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


class VendorBillSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    purchase_order_no = serializers.CharField(source="purchase_order.po_no", read_only=True)
    goods_receipt_no = serializers.CharField(source="goods_receipt.receipt_no", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    lines = VendorBillLineSerializer(many=True)

    class Meta:
        model = VendorBill
        fields = [
            "id",
            "bill_no",
            "bill_date",
            "vendor",
            "vendor_name",
            "purchase_order",
            "purchase_order_no",
            "goods_receipt",
            "goods_receipt_no",
            "finance_account",
            "finance_account_name",
            "status",
            "subtotal",
            "tax_total",
            "grand_total",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "posted_journal_entry", "posted_journal_entry_no", "created_at", "updated_at"]

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        subtotal = sum((_money(line.get("taxable_value")) for line in lines), Decimal("0.00"))
        tax_total = sum((_money(line.get("tax_amount")) for line in lines), Decimal("0.00"))
        grand_total = sum((_money(line.get("line_total")) for line in lines), Decimal("0.00"))
        bill = VendorBill.objects.create(
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            **validated_data,
        )
        VendorBillLine.objects.bulk_create([VendorBillLine(vendor_bill=bill, **line) for line in lines])
        return bill

    def update(self, instance, validated_data):
        if instance.status != "DRAFT":
            raise serializers.ValidationError("Only draft vendor bills can be edited.")
        lines = validated_data.pop("lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if lines is not None:
            instance.subtotal = sum((_money(line.get("taxable_value")) for line in lines), Decimal("0.00"))
            instance.tax_total = sum((_money(line.get("tax_amount")) for line in lines), Decimal("0.00"))
            instance.grand_total = sum((_money(line.get("line_total")) for line in lines), Decimal("0.00"))
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            VendorBillLine.objects.bulk_create([VendorBillLine(vendor_bill=instance, **line) for line in lines])
        return instance


class VendorPaymentSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    vendor_bill_no = serializers.CharField(source="vendor_bill.bill_no", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = VendorPayment
        fields = [
            "id",
            "payment_no",
            "payment_date",
            "vendor",
            "vendor_name",
            "vendor_bill",
            "vendor_bill_no",
            "amount",
            "finance_account",
            "finance_account_name",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reference_no",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "posted_journal_entry", "posted_journal_entry_no", "created_at", "updated_at"]
