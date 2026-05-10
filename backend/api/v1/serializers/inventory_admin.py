from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from inventory.models import PurchaseNeed, PurchaseNeedStatus
from inventory.services.purchase_need_service import ensure_primary_warehouse


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
