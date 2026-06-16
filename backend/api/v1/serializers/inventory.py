from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from inventory.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    InventoryItem,
    OpeningStockEntry,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestLine,
    PurchaseBill,
    PurchaseBillLine,
    StockAdjustment,
    StockAdjustmentLine,
    StockAdjustmentStatus,
    StockLedger,
    StockLocation,
    VendorBill,
    VendorBillLine,
    VendorAgreement,
    VendorContact,
    VendorPayment,
)
from inventory.services.stock_service import (
    compute_adjustment_line_readiness,
    compute_adjustment_posting_readiness,
    generate_stock_adjustment_number,
)
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
    inventory_item_standard_unit_cost = serializers.DecimalField(
        source="inventory_item.standard_unit_cost",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    unit_cost_snapshot = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    valuation_amount_snapshot = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    # Additive, read-only valuation readiness (never coerces unknown cost to 0).
    effective_unit_cost = serializers.SerializerMethodField()
    line_valuation = serializers.SerializerMethodField()
    valuation_status = serializers.SerializerMethodField()
    has_standard_cost = serializers.SerializerMethodField()
    requires_unit_cost = serializers.SerializerMethodField()
    line_blocker = serializers.SerializerMethodField()

    class Meta:
        model = StockAdjustmentLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "product_name",
            "inventory_item_standard_unit_cost",
            "quantity_delta",
            "unit_cost_snapshot",
            "valuation_amount_snapshot",
            "effective_unit_cost",
            "line_valuation",
            "valuation_status",
            "has_standard_cost",
            "requires_unit_cost",
            "line_blocker",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "inventory_item_standard_unit_cost",
            "valuation_amount_snapshot",
            "effective_unit_cost",
            "line_valuation",
            "valuation_status",
            "has_standard_cost",
            "requires_unit_cost",
            "line_blocker",
        ]

    def _readiness(self, obj):
        # ``obj`` is a saved StockAdjustmentLine in read paths; unsaved nested
        # write payloads (dicts) never reach SerializerMethodField rendering.
        if not isinstance(obj, StockAdjustmentLine) or obj.pk is None:
            return None
        cache = getattr(obj, "_readiness_cache", None)
        if cache is None:
            cache = compute_adjustment_line_readiness(obj)
            obj._readiness_cache = cache
        return cache

    def get_effective_unit_cost(self, obj):
        readiness = self._readiness(obj)
        if not readiness or readiness["effective_unit_cost"] is None:
            return None
        return f"{readiness['effective_unit_cost']:.2f}"

    def get_line_valuation(self, obj):
        readiness = self._readiness(obj)
        if not readiness or readiness["line_valuation"] is None:
            return None
        return f"{readiness['line_valuation']:.2f}"

    def get_valuation_status(self, obj):
        readiness = self._readiness(obj)
        return readiness["valuation_status"] if readiness else None

    def get_has_standard_cost(self, obj):
        readiness = self._readiness(obj)
        return bool(readiness["has_standard_cost"]) if readiness else False

    def get_requires_unit_cost(self, obj):
        readiness = self._readiness(obj)
        return bool(readiness["requires_unit_cost"]) if readiness else False

    def get_line_blocker(self, obj):
        readiness = self._readiness(obj)
        return readiness["line_blocker"] if readiness else None

    def validate_unit_cost_snapshot(self, value):
        if value is None:
            return None
        dec = _money(value)
        if dec < Decimal("0.00"):
            raise serializers.ValidationError("Unit cost cannot be negative.")
        return dec


def _replace_stock_adjustment_lines(adjustment: StockAdjustment, lines: list[dict]):
    adjustment.lines.all().delete()
    if not lines:
        return
    bulk_rows = []
    normalized: list[tuple[int, dict]] = []
    item_ids: list[int] = []
    for raw in lines:
        inv = raw["inventory_item"]
        pk = inv.pk if hasattr(inv, "pk") else int(inv)
        item_ids.append(pk)
        normalized.append((pk, raw))
    items_by_id = InventoryItem.objects.in_bulk(set(item_ids))
    for pk, raw in normalized:
        item = items_by_id[pk]
        snapshot = raw.get("unit_cost_snapshot")
        if snapshot is not None:
            snapshot_dec = _money(snapshot)
        else:
            std = item.standard_unit_cost
            snapshot_dec = _money(std) if std is not None else None
        bulk_rows.append(
            StockAdjustmentLine(
                stock_adjustment=adjustment,
                inventory_item_id=pk,
                quantity_delta=raw["quantity_delta"],
                notes=(raw.get("notes") or "").strip(),
                unit_cost_snapshot=snapshot_dec,
                valuation_amount_snapshot=None,
            )
        )
    StockAdjustmentLine.objects.bulk_create(bulk_rows)


class StockAdjustmentSerializer(serializers.ModelSerializer):
    adjustment_no = serializers.CharField(required=False, allow_blank=True)
    lines = StockAdjustmentLineSerializer(many=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    posted_by_username = serializers.CharField(source="posted_by.username", read_only=True)
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    # Additive, read-only posting readiness so the register can show per-row
    # blockers instead of failing the whole list when one row is not postable.
    can_post = serializers.SerializerMethodField()
    posting_blockers = serializers.SerializerMethodField()
    valuation_status = serializers.SerializerMethodField()
    requires_unit_cost = serializers.SerializerMethodField()

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
            "can_post",
            "posting_blockers",
            "valuation_status",
            "requires_unit_cost",
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
            "can_post",
            "posting_blockers",
            "valuation_status",
            "requires_unit_cost",
            "created_at",
            "updated_at",
        ]

    def _posting_readiness(self, obj):
        if not isinstance(obj, StockAdjustment) or obj.pk is None:
            return None
        cache = getattr(obj, "_posting_readiness_cache", None)
        if cache is None:
            cache = compute_adjustment_posting_readiness(obj)
            obj._posting_readiness_cache = cache
        return cache

    def get_can_post(self, obj):
        readiness = self._posting_readiness(obj)
        return bool(readiness["can_post"]) if readiness else False

    def get_posting_blockers(self, obj):
        readiness = self._posting_readiness(obj)
        return readiness["posting_blockers"] if readiness else []

    def get_valuation_status(self, obj):
        readiness = self._posting_readiness(obj)
        return readiness["valuation_status"] if readiness else None

    def get_requires_unit_cost(self, obj):
        readiness = self._posting_readiness(obj)
        return bool(readiness["requires_unit_cost"]) if readiness else False

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
    itc_claimable = serializers.SerializerMethodField()
    supplier_gst_as_cost = serializers.SerializerMethodField()
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
            "itc_claimable",
            "supplier_gst_as_cost",
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

    def get_itc_claimable(self, obj):
        snapshot = obj.tax_profile_snapshot or {}
        return bool(snapshot.get("itc_claimable", False))

    def get_supplier_gst_as_cost(self, obj):
        snapshot = obj.tax_profile_snapshot or {}
        return bool(snapshot.get("supplier_gst_as_cost", False))


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


_OPENING_STOCK_ENTRY_READ_FIELDS = [
    "id",
    "batch",
    "batch_key",
    "csv_row_number",
    "inventory_item",
    "product_code",
    "product_name",
    "sku",
    "stock_location",
    "stock_location_code",
    "stock_location_name",
    "quantity",
    "unit_cost_snapshot",
    "valuation_amount_snapshot",
    "effective_date",
    "note",
    "status",
    "source",
    "created_by",
    "posted_by",
    "posted_at",
    "cancelled_at",
    "correction_adjustment",
    "created_at",
    "updated_at",
]


class OpeningStockEntrySerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="inventory_item.product.product_code", read_only=True)
    product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)
    sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    stock_location_code = serializers.CharField(source="stock_location.code", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    batch_key = serializers.CharField(source="batch.batch_key", read_only=True, allow_null=True)

    class Meta:
        model = OpeningStockEntry
        fields = _OPENING_STOCK_ENTRY_READ_FIELDS
        read_only_fields = _OPENING_STOCK_ENTRY_READ_FIELDS


class OpeningStockEntryWriteSerializer(serializers.ModelSerializer):
    """Writable payload for manual draft create/update."""

    class Meta:
        model = OpeningStockEntry
        fields = [
            "inventory_item",
            "stock_location",
            "quantity",
            "unit_cost_snapshot",
            "effective_date",
            "note",
        ]
        extra_kwargs = {
            "effective_date": {"required": True},
            "note": {"required": False, "allow_blank": True},
            "unit_cost_snapshot": {"required": False, "allow_null": True},
        }

    def validate_quantity(self, value):
        if value is not None and Decimal(str(value)) < Decimal("0"):
            raise serializers.ValidationError("Quantity cannot be negative.")
        return value


class OpeningStockPostSerializer(serializers.Serializer):
    pass


class OpeningStockCancelSerializer(serializers.Serializer):
    pass


class OpeningStockCorrectionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)
    quantity_delta = serializers.DecimalField(max_digits=12, decimal_places=3, required=True)
    unit_cost_snapshot = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    adjustment_date = serializers.DateField(required=False, allow_null=True)


class OpeningStockBulkApplySerializer(serializers.Serializer):
    dry_run = serializers.BooleanField(required=False, default=False)
    auto_post = serializers.BooleanField(required=False, default=False)
    default_effective_date = serializers.DateField(required=False, allow_null=True)


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


class VendorAgreementSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)

    class Meta:
        model = VendorAgreement
        fields = [
            "id",
            "agreement_no",
            "vendor",
            "vendor_name",
            "effective_from",
            "effective_to",
            "status",
            "payment_terms",
            "credit_period_days",
            "notes",
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
        vendor = attrs.get("vendor") or getattr(instance, "vendor", None)
        if vendor and not vendor.is_active:
            raise serializers.ValidationError({"vendor": "Purchase order vendor must be active."})
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
            "allow_over_receive",
            "over_receive_reason",
            "posted_at",
            "posted_by",
            "posted_by_username",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "posted_at", "posted_by", "posted_by_username", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        purchase_order = attrs.get("purchase_order") or getattr(instance, "purchase_order", None)
        lines = attrs.get("lines")
        if lines:
            po_line_map = {}
            if purchase_order is not None:
                po_line_map = {line.id: line for line in purchase_order.lines.all()}
            for line in lines:
                po_line = line.get("purchase_order_line")
                item = line.get("inventory_item")
                if po_line and po_line.purchase_order_id != getattr(purchase_order, "id", None):
                    raise serializers.ValidationError({"lines": "Purchase receipt lines must reference lines from the selected PO."})
                if po_line and item and po_line.inventory_item_id != item.id:
                    raise serializers.ValidationError({"lines": "Receipt line inventory item must match PO line inventory item."})
                if po_line and po_line.id not in po_line_map:
                    raise serializers.ValidationError({"lines": "Invalid purchase order line for this receipt."})
        if attrs.get("allow_over_receive") and not (attrs.get("over_receive_reason") or "").strip():
            raise serializers.ValidationError({"over_receive_reason": "Reason is required when over-receive is enabled."})
        return attrs

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


class PurchaseRequestLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    inventory_item_product_name = serializers.CharField(source="inventory_item.product.name", read_only=True)

    class Meta:
        model = PurchaseRequestLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "inventory_item_product_name",
            "quantity_requested",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PurchaseRequestSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    stock_location_name = serializers.CharField(source="stock_location.name", read_only=True)
    lines = PurchaseRequestLineSerializer(many=True)

    class Meta:
        model = PurchaseRequest
        fields = [
            "id",
            "request_no",
            "request_date",
            "requested_by",
            "requested_by_username",
            "status",
            "branch",
            "stock_location",
            "stock_location_name",
            "vendor",
            "vendor_name",
            "source_purchase_need",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "requested_by_username", "created_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status not in {"DRAFT", "APPROVED"}:
            raise serializers.ValidationError("Only draft/approved purchase requests can be edited.")
        if not attrs.get("lines") and instance is None:
            raise serializers.ValidationError({"lines": "At least one purchase request line is required."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        request = self.context.get("request")
        row = PurchaseRequest.objects.create(requested_by=getattr(request, "user", None), **validated_data)
        PurchaseRequestLine.objects.bulk_create([PurchaseRequestLine(purchase_request=row, **line) for line in lines])
        return row

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            PurchaseRequestLine.objects.bulk_create([PurchaseRequestLine(purchase_request=instance, **line) for line in lines])
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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        vendor = attrs.get("vendor") or getattr(getattr(self, "instance", None), "vendor", None)
        vendor_bill = attrs.get("vendor_bill") or getattr(getattr(self, "instance", None), "vendor_bill", None)
        if vendor and vendor_bill and vendor_bill.vendor_id != vendor.id:
            raise serializers.ValidationError({"vendor_bill": "Vendor bill does not belong to selected vendor."})
        return attrs
