"""
Quick-create APIs for accessories, raw materials, and accessory variant groups.
Also serves the billing accessory-options endpoint used at billing/contract time.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.models import (
    AccessoryVariantGroup,
    FGAccessoryChargeMode,
    FinishedGoodAccessoryLink,
    FinishedGoodServiceLink,
    InventoryItem,
    InventoryItemType,
    InventoryValuationMethod,
    StockLocation,
)
from subscriptions.models import Product, PlanType, ProductItemType

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

class AccessoryVariantGroupSerializer(serializers.ModelSerializer):
    variant_count = serializers.SerializerMethodField()

    class Meta:
        model = AccessoryVariantGroup
        fields = [
            "id", "code", "name", "category", "subcategory",
            "description", "is_required", "is_active", "sort_order",
            "variant_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "variant_count", "created_at", "updated_at"]

    def get_variant_count(self, obj):
        return obj.variants.filter(
            stock_item_type=InventoryItemType.ACCESSORY, is_active=True
        ).count()


class AccessoryVariantGroupWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessoryVariantGroup
        fields = ["code", "name", "category", "subcategory", "description", "is_required", "is_active", "sort_order"]


class QuickCreateInventoryItemSerializer(serializers.Serializer):
    """Shared fields for quick-create of accessory or raw material."""
    product_code = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=255)
    base_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"))
    unit_of_measure = serializers.CharField(max_length=30, default="PCS")
    category = serializers.CharField(max_length=120, allow_blank=True, default="")
    subcategory = serializers.CharField(max_length=120, allow_blank=True, default="")
    description = serializers.CharField(allow_blank=True, default="")
    sku = serializers.CharField(max_length=60, allow_blank=True, default="")
    standard_unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0.00"))
    reorder_level_qty = serializers.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO, min_value=QUANTITY_ZERO)
    # Accessory-only fields
    variant_group = serializers.PrimaryKeyRelatedField(
        queryset=AccessoryVariantGroup.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    variant_label = serializers.CharField(max_length=120, allow_blank=True, default="")
    # Stock location
    default_stock_location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )


# ---------------------------------------------------------------------------
# Accessory Variant Group CRUD
# ---------------------------------------------------------------------------

class AdminAccessoryVariantGroupListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = AccessoryVariantGroup.objects.all()
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(category__icontains=q))
        cat = (request.query_params.get("category") or "").strip()
        if cat:
            qs = qs.filter(category__icontains=cat)
        active_only = request.query_params.get("active_only", "").lower() in {"true", "1"}
        if active_only:
            qs = qs.filter(is_active=True)

        page = max(1, int(request.query_params.get("page", 1)))
        page_size = min(100, max(10, int(request.query_params.get("page_size", 50))))
        offset = (page - 1) * page_size
        total = qs.count()
        items = qs[offset: offset + page_size]
        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "results": [AccessoryVariantGroupSerializer(i).data for i in items],
        })

    @transaction.atomic
    def post(self, request):
        ser = AccessoryVariantGroupWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        group = AccessoryVariantGroup(**ser.validated_data)
        group.save()
        return Response(AccessoryVariantGroupSerializer(group).data, status=status.HTTP_201_CREATED)


class AdminAccessoryVariantGroupDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get(self, pk):
        return get_object_or_404(AccessoryVariantGroup, pk=pk)

    def get(self, request, pk):
        group = self._get(pk)
        variants = group.variants.filter(
            stock_item_type=InventoryItemType.ACCESSORY, is_active=True
        ).select_related("product").order_by("variant_label", "product__name")
        data = AccessoryVariantGroupSerializer(group).data
        data["variants"] = [
            {
                "id": v.id,
                "product_id": v.product_id,
                "product_name": v.product.name,
                "product_code": v.product.product_code,
                "variant_label": v.variant_label,
                "sku": v.sku,
                "unit_of_measure": v.unit_of_measure,
                "standard_unit_cost": str(v.standard_unit_cost or "0.00"),
                "base_price": str(v.product.base_price),
                "stock_tracking_status": v.stock_tracking_status,
            }
            for v in variants
        ]
        return Response(data)

    @transaction.atomic
    def patch(self, request, pk):
        group = self._get(pk)
        ser = AccessoryVariantGroupWriteSerializer(group, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            setattr(group, k, v)
        group.save()
        return Response(AccessoryVariantGroupSerializer(group).data)

    @transaction.atomic
    def delete(self, request, pk):
        group = self._get(pk)
        if group.variants.exists():
            return Response({"detail": "Cannot delete: group has linked variants. Unassign them first."}, status=status.HTTP_409_CONFLICT)
        if group.fg_links.exists():
            return Response({"detail": "Cannot delete: group is linked to finished goods."}, status=status.HTTP_409_CONFLICT)
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Quick Create — Accessory
# ---------------------------------------------------------------------------

class AdminQuickCreateAccessoryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request):
        ser = QuickCreateInventoryItemSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        if Product.objects.filter(product_code=d["product_code"].strip().upper()).exists():
            return Response({"detail": f"Product code '{d['product_code']}' already exists."}, status=status.HTTP_409_CONFLICT)

        product = Product(
            product_code=d["product_code"].strip().upper(),
            name=d["name"].strip(),
            base_price=d["base_price"],
            category=d.get("category", "").strip(),
            subcategory=d.get("subcategory", "").strip(),
            description=d.get("description", "").strip(),
            sku=d.get("sku", "").strip() or None,
            is_active=True,
            is_emi_enabled=False,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_direct_sale_enabled=True,
            item_type=ProductItemType.ACCESSORY,
        )
        product.save()

        inv_item = InventoryItem(
            product=product,
            stock_item_type=InventoryItemType.ACCESSORY,
            default_stock_location=d.get("default_stock_location"),
            stock_tracking_enabled=True,
            opening_stock_qty=QUANTITY_ZERO,
            reorder_level_qty=d.get("reorder_level_qty") or QUANTITY_ZERO,
            standard_unit_cost=d.get("standard_unit_cost"),
            unit_of_measure=(d.get("unit_of_measure") or "PCS").strip().upper() or "PCS",
            variant_group=d.get("variant_group"),
            variant_label=(d.get("variant_label") or "").strip(),
            stock_tracking_status=InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK,
        )
        inv_item.save()

        return Response({
            "product_id": product.id,
            "product_code": product.product_code,
            "product_name": product.name,
            "inventory_item_id": inv_item.id,
            "stock_item_type": inv_item.stock_item_type,
            "variant_group": inv_item.variant_group_id,
            "variant_label": inv_item.variant_label,
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Quick Create — Raw Material
# ---------------------------------------------------------------------------

class AdminQuickCreateRawMaterialView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request):
        ser = QuickCreateInventoryItemSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        if Product.objects.filter(product_code=d["product_code"].strip().upper()).exists():
            return Response({"detail": f"Product code '{d['product_code']}' already exists."}, status=status.HTTP_409_CONFLICT)

        product = Product(
            product_code=d["product_code"].strip().upper(),
            name=d["name"].strip(),
            base_price=d["base_price"],
            category=d.get("category", "").strip(),
            subcategory=d.get("subcategory", "").strip(),
            description=d.get("description", "").strip(),
            sku=d.get("sku", "").strip() or None,
            is_active=True,
            is_emi_enabled=False,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_direct_sale_enabled=True,
            item_type=ProductItemType.RAW_MATERIAL,
        )
        product.save()

        inv_item = InventoryItem(
            product=product,
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            default_stock_location=d.get("default_stock_location"),
            stock_tracking_enabled=True,
            opening_stock_qty=QUANTITY_ZERO,
            reorder_level_qty=d.get("reorder_level_qty") or QUANTITY_ZERO,
            standard_unit_cost=d.get("standard_unit_cost"),
            unit_of_measure=(d.get("unit_of_measure") or "PCS").strip().upper() or "PCS",
            stock_tracking_status=InventoryItem.StockTrackingStatus.PREPARED_NO_STOCK,
        )
        inv_item.save()

        return Response({
            "product_id": product.id,
            "product_code": product.product_code,
            "product_name": product.name,
            "inventory_item_id": inv_item.id,
            "stock_item_type": inv_item.stock_item_type,
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Quick Create — Service
# ---------------------------------------------------------------------------

class AdminQuickCreateServiceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request):
        ser = QuickCreateInventoryItemSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        if Product.objects.filter(product_code=d["product_code"].strip().upper()).exists():
            return Response({"detail": f"Product code '{d['product_code']}' already exists."}, status=status.HTTP_409_CONFLICT)

        product = Product(
            product_code=d["product_code"].strip().upper(),
            name=d["name"].strip(),
            base_price=d["base_price"],
            category=d.get("category", "").strip(),
            subcategory=d.get("subcategory", "").strip(),
            description=d.get("description", "").strip(),
            sku=d.get("sku", "").strip() or None,
            is_active=True,
            is_emi_enabled=False,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_direct_sale_enabled=True,
            item_type=ProductItemType.SERVICE,
        )
        product.save()

        return Response({
            "product_id": product.id,
            "product_code": product.product_code,
            "product_name": product.name,
            "stock_item_type": None, # Services don't need inventory item
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Billing Accessory Options — used at billing / contract creation time
# Called with a product_id to get all accessory groups + services for that FG
# ---------------------------------------------------------------------------

class AdminBillingAccessoryOptionsView(APIView):
    """
    Returns the full accessory + service selection options for a finished good,
    ready to render in the billing / contract workspace.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, product_id: int):
        # Resolve product → inventory item
        try:
            inv_item = InventoryItem.objects.select_related("product").get(
                product_id=product_id,
                stock_item_type=InventoryItemType.FINISHED_GOOD,
            )
        except InventoryItem.DoesNotExist:
            return Response({"accessory_options": [], "service_options": [], "has_options": False})

        # Accessory links
        links = (
            FinishedGoodAccessoryLink.objects
            .filter(finished_good=inv_item)
            .select_related(
                "accessory__product",
                "variant_group",
            )
            .prefetch_related("variant_group__variants__product")
            .order_by("sort_order", "id")
        )

        accessory_options = []
        for link in links:
            if link.variant_group_id:
                # Group link: offer all active variants
                variants = [
                    {
                        "id": v.id,
                        "product_id": v.product_id,
                        "product_name": v.product.name,
                        "product_code": v.product.product_code,
                        "variant_label": v.variant_label or v.product.name,
                        "sku": v.sku,
                        "unit_of_measure": v.unit_of_measure,
                        "base_price": str(v.product.base_price),
                        "standard_unit_cost": str(v.standard_unit_cost or "0.00"),
                    }
                    for v in link.variant_group.variants.filter(
                        stock_item_type=InventoryItemType.ACCESSORY,
                        is_active=True,
                    ).select_related("product").order_by("variant_label", "product__name")
                ]
                accessory_options.append({
                    "link_id": link.id,
                    "link_type": "group",
                    "group_id": link.variant_group_id,
                    "group_name": link.variant_group.name,
                    "group_code": link.variant_group.code,
                    "group_category": link.variant_group.category,
                    "group_subcategory": link.variant_group.subcategory,
                    "is_required": link.variant_group.is_required,
                    "charge_mode": link.charge_mode,
                    "sale_price": str(link.sale_price),
                    "is_default_included": link.is_default_included,
                    "notes": link.notes,
                    "sort_order": link.sort_order,
                    "variants": variants,
                    "selected_variant_id": variants[0]["id"] if variants else None,
                })
            elif link.accessory_id:
                # Single item link
                acc = link.accessory
                accessory_options.append({
                    "link_id": link.id,
                    "link_type": "single",
                    "group_id": None,
                    "group_name": None,
                    "group_code": None,
                    "group_category": "",
                    "group_subcategory": "",
                    "is_required": False,
                    "charge_mode": link.charge_mode,
                    "sale_price": str(link.sale_price),
                    "is_default_included": link.is_default_included,
                    "notes": link.notes,
                    "sort_order": link.sort_order,
                    "variants": [
                        {
                            "id": acc.id,
                            "product_id": acc.product_id,
                            "product_name": acc.product.name,
                            "product_code": acc.product.product_code,
                            "variant_label": acc.variant_label or acc.product.name,
                            "sku": acc.sku,
                            "unit_of_measure": acc.unit_of_measure,
                            "base_price": str(acc.product.base_price),
                            "standard_unit_cost": str(acc.standard_unit_cost or "0.00"),
                        }
                    ],
                    "selected_variant_id": acc.id,
                })

        # Service links
        svc_links = (
            FinishedGoodServiceLink.objects
            .filter(finished_good=inv_item)
            .select_related("service")
            .order_by("sort_order", "id")
        )
        service_options = [
            {
                "link_id": lnk.id,
                "service_id": lnk.service_id,
                "service_code": lnk.service.code,
                "service_name": lnk.service.name,
                "service_category": lnk.service.category,
                "charge_mode": lnk.charge_mode,
                "sale_price": str(lnk.sale_price) if lnk.sale_price else str(lnk.service.standard_price),
                "standard_price": str(lnk.service.standard_price),
                "tax_rate_percent": str(lnk.service.tax_rate_percent),
                "hsn_sac_code": lnk.service.hsn_sac_code,
                "is_default_included": lnk.is_default_included,
                "notes": lnk.notes,
                "sort_order": lnk.sort_order,
            }
            for lnk in svc_links
        ]

        return Response({
            "product_id": product_id,
            "inventory_item_id": inv_item.id,
            "product_name": inv_item.product.name,
            "accessory_options": accessory_options,
            "service_options": service_options,
            "has_options": bool(accessory_options or service_options),
        })


# ---------------------------------------------------------------------------
# Assign variant_group to an inventory item
# ---------------------------------------------------------------------------

class AdminInventoryItemVariantGroupView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def patch(self, request, pk):
        item = get_object_or_404(InventoryItem, pk=pk, stock_item_type=InventoryItemType.ACCESSORY)
        group_id = request.data.get("variant_group")
        label = (request.data.get("variant_label") or "").strip()
        if group_id:
            group = get_object_or_404(AccessoryVariantGroup, pk=group_id)
            item.variant_group = group
        else:
            item.variant_group = None
        item.variant_label = label
        item.save()
        return Response({
            "id": item.id,
            "variant_group": item.variant_group_id,
            "variant_group_name": item.variant_group.name if item.variant_group_id else None,
            "variant_label": item.variant_label,
        })


# ---------------------------------------------------------------------------
# FG Accessory Link — add group-type link
# ---------------------------------------------------------------------------

class AdminFGAccessoryGroupLinkView(APIView):
    """Add a variant-group link to a finished good (separate from single-item link)."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @transaction.atomic
    def post(self, request, fg_pk):
        fg = get_object_or_404(InventoryItem, pk=fg_pk, stock_item_type=InventoryItemType.FINISHED_GOOD)
        group_id = request.data.get("variant_group")
        if not group_id:
            return Response({"detail": "variant_group is required."}, status=status.HTTP_400_BAD_REQUEST)
        group = get_object_or_404(AccessoryVariantGroup, pk=group_id)
        if FinishedGoodAccessoryLink.objects.filter(finished_good=fg, variant_group=group).exists():
            return Response({"detail": "This variant group is already linked."}, status=status.HTTP_409_CONFLICT)

        charge_mode = request.data.get("charge_mode", FGAccessoryChargeMode.FREE)
        sale_price = Decimal(str(request.data.get("sale_price", "0.00") or "0.00"))
        is_default = bool(request.data.get("is_default_included", True))
        sort_order = int(request.data.get("sort_order", 1))
        notes = str(request.data.get("notes", "") or "").strip()

        link = FinishedGoodAccessoryLink(
            finished_good=fg,
            variant_group=group,
            charge_mode=charge_mode,
            sale_price=sale_price,
            is_default_included=is_default,
            sort_order=sort_order,
            notes=notes,
        )
        link.save()
        return Response({
            "id": link.id,
            "finished_good": fg.id,
            "variant_group": group.id,
            "variant_group_name": group.name,
            "charge_mode": link.charge_mode,
            "sale_price": str(link.sale_price),
            "is_default_included": link.is_default_included,
        }, status=status.HTTP_201_CREATED)
