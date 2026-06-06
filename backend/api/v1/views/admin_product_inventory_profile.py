from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory import InventoryItemSerializer
from inventory.models import StockLedger, StockLocation
from inventory.services.inventory_profile_service import prepare_inventory_profile_for_product
from subscriptions.models import AuditLog, Product


class AdminProductInventoryProfilePrepareSerializer(serializers.Serializer):
    default_stock_location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True).order_by("name", "id"),
        required=False,
        allow_null=True,
    )
    stock_tracking_enabled = serializers.BooleanField(required=False, default=True)
    opening_stock_qty = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, default=Decimal("0.000"))
    confirm_opening_stock = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        opening_stock_qty = attrs.get("opening_stock_qty") or Decimal("0.000")
        if opening_stock_qty < Decimal("0.000"):
            raise serializers.ValidationError({"opening_stock_qty": "Opening stock cannot be negative."})
        if opening_stock_qty > Decimal("0.000"):
            raise serializers.ValidationError({
                "opening_stock_qty": "Quick inventory preparation does not create stock ledger movement. Prepare the profile now, then use the controlled Opening Stock workflow for non-zero stock."
            })
        return attrs


def _readiness_payload(product: Product, inventory_profile) -> dict:
    badges: list[str] = []
    missing: list[str] = []
    actions: list[str] = []
    if product.category or product.subcategory:
        badges.append("Cataloged")
    else:
        badges.append("Catalog Pending")
        missing.append("category_or_subcategory")
        actions.append("Add product category/subcategory")
    if product.image:
        badges.append("Image Ready")
    else:
        badges.append("No Image")
        missing.append("image")
        actions.append("Upload product image")
    if product.sku or product.product_code:
        badges.append("SKU Ready")
    else:
        badges.append("SKU Pending")
        missing.append("sku_or_product_code")
    if inventory_profile is not None:
        badges.append("Inventory Ready")
    else:
        badges.append("Stock Profile Pending")
        actions.append("Prepare inventory profile")
    if product.is_active and product.is_emi_enabled:
        badges.append("Subscription Ready")
    if product.is_active and product.is_direct_sale_enabled:
        badges.append("Direct Sale Ready")
    if product.is_rent_enabled or product.is_lease_enabled:
        badges.append("Rent/Lease Ready")
    return {"readiness_badges": badges, "missing_fields": missing, "next_actions": actions}


class AdminProductInventoryProfilePrepareView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, pk: int):
        serializer = AdminProductInventoryProfilePrepareSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        product = get_object_or_404(Product.objects.select_for_update(), pk=pk)
        before_ledger_count = StockLedger.objects.count()
        inventory_profile, created = prepare_inventory_profile_for_product(
            product_id=product.id,
            actor=request.user,
            stock_tracking_enabled=serializer.validated_data.get("stock_tracking_enabled", True),
        )
        default_stock_location = serializer.validated_data.get("default_stock_location")
        if default_stock_location and inventory_profile.default_stock_location_id != default_stock_location.id:
            inventory_profile.default_stock_location = default_stock_location
            inventory_profile.save(update_fields=["default_stock_location", "updated_at"])

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.PRODUCT_INVENTORY_PROFILE_PREPARED,
            model_name="InventoryItem",
            object_id=inventory_profile.id,
            performed_by=request.user,
            metadata={
                "event": "PRODUCT_INVENTORY_PROFILE_PREPARED",
                "product_id": product.id,
                "created": created,
                "stock_tracking_enabled": inventory_profile.stock_tracking_enabled,
                "stock_ledger_created": False,
                "historical_snapshots_preserved": True,
            },
        )
        payload = InventoryItemSerializer(inventory_profile, context={"request": request}).data
        readiness = _readiness_payload(product, inventory_profile)
        return Response(
            {
                "created": created,
                "inventory_profile_id": inventory_profile.id,
                "inventory_ready": True,
                "inventory_profile": payload,
                "stock_ledger_created": StockLedger.objects.count() > before_ledger_count,
                "historical_snapshots_preserved": True,
                **readiness,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
