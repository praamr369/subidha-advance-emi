from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from inventory.models import PurchaseNeed, PurchaseNeedStatus
from inventory.services.purchase_need_service import ensure_primary_warehouse
from inventory.services.inventory_profile_service import get_inventory_profile_status
from inventory.models import InventoryItem, StockLocation


class AdminPurchaseNeedSerializer(serializers.ModelSerializer):
    """Stock need / purchase need row exposed as operational \"stock need\"."""

    source_type = serializers.CharField(source="source_module", read_only=True)
    notes = serializers.CharField(source="note", read_only=True)

    class Meta:
        model = PurchaseNeed
        fields = [
            "id",
            "need_no",
            "source_type",
            "source_module",
            "source_object_id",
            "product",
            "product_name_snapshot",
            "warehouse",
            "branch",
            "customer",
            "required_quantity",
            "available_quantity",
            "shortage_quantity",
            "priority",
            "status",
            "demand_snapshot",
            "notes",
            "fulfilled_at",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "need_no",
            "product_name_snapshot",
            "created_by",
            "created_at",
            "updated_at",
        ]


class AdminPurchaseNeedCreateSerializer(serializers.ModelSerializer):
    warehouse = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseNeed._meta.get_field("warehouse").remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    notes = serializers.CharField(source="note", required=False, allow_blank=True, default="")

    class Meta:
        model = PurchaseNeed
        fields = [
            "product",
            "warehouse",
            "branch",
            "customer",
            "required_quantity",
            "available_quantity",
            "shortage_quantity",
            "priority",
            "status",
            "source_module",
            "source_object_id",
            "notes",
        ]

    def validate_required_quantity(self, value):
        qty = Decimal(str(value))
        if qty <= Decimal("0"):
            raise serializers.ValidationError("required_quantity must be positive.")
        return qty

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.setdefault("source_module", PurchaseNeed.SourceModule.GENERAL)
        attrs.setdefault("status", PurchaseNeedStatus.OPEN)
        avail = Decimal(str(attrs.get("available_quantity") or "0"))
        short = Decimal(str(attrs.get("shortage_quantity") or "0"))
        req = Decimal(str(attrs.get("required_quantity") or "0"))
        if short <= Decimal("0"):
            inferred = req - avail
            attrs["shortage_quantity"] = max(Decimal("0.000"), inferred)
            attrs["available_quantity"] = avail
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        warehouse = validated_data.get("warehouse") or ensure_primary_warehouse()
        validated_data["warehouse"] = warehouse
        validated_data.setdefault("created_by", request.user if request.user.is_authenticated else None)
        return PurchaseNeed.objects.create(**validated_data)


class AdminPurchaseNeedPatchSerializer(serializers.ModelSerializer):
    notes = serializers.CharField(source="note", required=False, allow_blank=True)

    class Meta:
        model = PurchaseNeed
        fields = ["status", "priority", "branch", "notes", "fulfilled_at", "required_quantity", "shortage_quantity"]

    def validate_status(self, value):
        allowed = {c[0] for c in PurchaseNeedStatus.choices}
        cleaned = (value or "").strip().upper()
        if cleaned not in allowed:
            raise serializers.ValidationError("Invalid status.")
        return cleaned

    def update(self, instance, validated_data):
        note = validated_data.pop("note", serializers.empty)
        if note is not serializers.empty:
            validated_data["note"] = note
        new_status = validated_data.get("status", instance.status)
        terminal = {
            PurchaseNeedStatus.FULFILLED,
            PurchaseNeedStatus.CLOSED,
            PurchaseNeedStatus.RECEIVED,
            PurchaseNeedStatus.CANCELLED,
        }
        if new_status in terminal and not validated_data.get("fulfilled_at") and not instance.fulfilled_at:
            validated_data["fulfilled_at"] = timezone.now()
        return super().update(instance, validated_data)


class AdminInventoryProfileListSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    stock_tracking_status = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "inventory_code",
            "product",
            "product_name",
            "product_code",
            "sku",
            "stock_tracking_enabled",
            "stock_tracking_status",
            "is_active",
        ]

    def get_stock_tracking_status(self, obj):
        return get_inventory_profile_status(obj)


class AdminInventoryProfileDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_base_price = serializers.DecimalField(source="product.base_price", max_digits=12, decimal_places=2, read_only=True)
    stock_tracking_status = serializers.SerializerMethodField()
    margin_preview = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "inventory_code",
            "product",
            "product_name",
            "product_code",
            "product_base_price",
            "sku",
            "unit_of_measure",
            "stock_tracking_enabled",
            "stock_tracking_status",
            "is_active",
            "reorder_level_qty",
            "default_stock_location",
            "preferred_stock_location",
            "valuation_method",
            "costing_method",
            "standard_unit_cost",
            "purchase_unit_cost",
            "manufacturing_cost_enabled",
            "manufacturing_raw_material_cost",
            "manufacturing_labour_cost",
            "manufacturing_overhead_cost",
            "manufacturing_finished_goods_output_qty",
            "margin_preview",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "product", "created_at", "updated_at", "stock_tracking_status", "margin_preview"]

    def get_stock_tracking_status(self, obj):
        return get_inventory_profile_status(obj)

    def get_margin_preview(self, obj):
        if obj.standard_unit_cost is None:
            return None
        return str((obj.product.base_price or Decimal("0.00")) - (obj.standard_unit_cost or Decimal("0.00")))


class AdminInventoryProfileUpdateSerializer(serializers.ModelSerializer):
    preferred_stock_location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True).order_by("name", "id"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = InventoryItem
        fields = [
            "sku",
            "reorder_level_qty",
            "default_stock_location",
            "preferred_stock_location",
            "valuation_method",
            "costing_method",
            "standard_unit_cost",
            "purchase_unit_cost",
            "manufacturing_cost_enabled",
            "manufacturing_raw_material_cost",
            "manufacturing_labour_cost",
            "manufacturing_overhead_cost",
            "manufacturing_finished_goods_output_qty",
            "is_active",
        ]
