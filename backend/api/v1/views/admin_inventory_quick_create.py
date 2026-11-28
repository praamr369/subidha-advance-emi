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
from subscriptions.models import Product, PlanType, ProductItemType, ProductStockType

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def ensure_service_product(svc) -> Product:
    """Return a non-stock SERVICE Product backing a ServiceCatalogItem for Direct Sale billing."""
    code = (svc.code or f"SVC-{svc.id}").strip().upper()
    existing = Product.objects.filter(product_code=code).first()
    if existing is not None:
        return existing
    defaults = {
        "name": (svc.name or code).strip(),
        "category": (svc.category or "").strip(),
        "base_price": svc.standard_price if svc.standard_price is not None else MONEY_ZERO,
        "gst_rate": svc.tax_rate_percent,
        "hsn_sac_code": (svc.hsn_sac_code or "").strip(),
        "unit_of_measure": "NOS",
        "item_type": ProductItemType.SERVICE,
        "stock_type": ProductStockType.NON_STOCK,
        "is_active": True,
        "is_direct_sale_enabled": True,
        "is_emi_enabled": False,
        "is_rent_enabled": False,
        "is_lease_enabled": False,
    }
    product, _ = Product.objects.get_or_create(product_code=code, defaults=defaults)
    return product


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
        fg_links = group.fg_links.select_related("finished_good__product").all()
        data["linked_finished_goods"] = [
            {
                "id": lnk.id,
                "finished_good_id": lnk.finished_good_id,
                "product_name": lnk.finished_good.product.name,
                "product_code": lnk.finished_good.product.product_code,
                "sku": lnk.finished_good.sku,
                "charge_mode": lnk.charge_mode,
                "sale_price": str(lnk.sale_price),
                "quantity": str(lnk.quantity),
                "is_default_included": lnk.is_default_included,
            }
            for lnk in fg_links
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

        try:
            from products_pim.services.core import ensure_pim_product_for_product
            ensure_pim_product_for_product(product)
        except Exception:
            pass

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

        try:
            from products_pim.services.core import ensure_pim_product_for_product
            ensure_pim_product_for_product(product)
        except Exception:
            pass

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

        try:
            from products_pim.services.core import ensure_pim_product_for_product
            ensure_pim_product_for_product(product)
        except Exception:
            pass

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

def _serialize_variant_item(v: InventoryItem) -> dict:
    try:
        avail = v.available_qty()
        phys = v.current_stock_quantity()
    except Exception:
        avail = QUANTITY_ZERO
        phys = QUANTITY_ZERO
    return {
        "id": v.id,
        "product_id": v.product_id,
        "product_name": v.product.name,
        "product_code": v.product.product_code,
        "variant_label": v.variant_label or v.product.name,
        "sku": v.sku,
        "unit_of_measure": v.unit_of_measure,
        "base_price": str(v.product.base_price),
        "standard_unit_cost": str(v.standard_unit_cost or "0.00"),
        "purchase_unit_cost": str(v.purchase_unit_cost or v.standard_unit_cost or "0.00"),
        "available_stock": f"{avail:.3f}",
        "physical_stock": f"{phys:.3f}",
    }


def _is_same_accessory_family(a: InventoryItem, b: InventoryItem) -> bool:
    """Returns True if two accessories belong to the same variant family (e.g. both are Side Rails or both are Plyboards)."""
    if not a or not b or a.id == b.id:
        return False
    if a.variant_group_id and b.variant_group_id and a.variant_group_id == b.variant_group_id:
        return True
    try:
        from products_pim.models import PimProduct
        p_a = PimProduct.objects.filter(operational_product_id=a.product_id).first()
        p_b = PimProduct.objects.filter(operational_product_id=b.product_id).first()
        if p_a and p_b:
            if p_a.subcategory_id and p_b.subcategory_id and p_a.subcategory_id == p_b.subcategory_id:
                return True
    except Exception:
        pass
    name_a = (getattr(a.product, "name", "") or "").lower()
    name_b = (getattr(b.product, "name", "") or "").lower()
    keywords = ["plyboard", "plywood", "side rail", "rail", "buffer", "fastener", "hinge", "handle", "cushion", "mirror"]
    for kw in keywords:
        if kw in name_a and kw in name_b:
            return True
    return False


def _collect_accessory_variants(acc: InventoryItem, sibling_acc_items: list[InventoryItem] | None = None) -> list[dict]:
    """Collect active sibling variants for an accessory (via AccessoryVariantGroup, PIM ProductVariant,
    co-linked accessories, matching subcategory, or name family)."""
    seen_ids: set[int] = set()
    variants: list[dict] = []

    def _add(item: InventoryItem):
        if item and item.is_active and item.id not in seen_ids:
            seen_ids.add(item.id)
            variants.append(_serialize_variant_item(item))

    # Always ensure root accessory is included
    _add(acc)

    # 1. Direct AccessoryVariantGroup linkage
    if acc.variant_group_id:
        for v in (
            acc.variant_group.variants.filter(
                stock_item_type=InventoryItemType.ACCESSORY,
                is_active=True,
            )
            .select_related("product")
            .order_by("variant_label", "product__name")
        ):
            _add(v)

    # 2. Sibling PIM product variants
    try:
        from products_pim.models import ProductVariant as PimVariant

        pim_prod = None
        if getattr(acc, "product", None):
            pv = PimVariant.objects.filter(operational_product_id=acc.product_id).select_related("product").first()
            if pv and pv.product_id:
                pim_prod = pv.product
            elif hasattr(acc.product, "pim"):
                pim_prod = acc.product.pim
        if pim_prod:
            sibling_op_ids = list(
                PimVariant.objects.filter(product=pim_prod, is_active=True, operational_product_id__isnull=False)
                .values_list("operational_product_id", flat=True)
            )
            if sibling_op_ids:
                for sib in (
                    InventoryItem.objects.filter(product_id__in=sibling_op_ids, is_active=True)
                    .select_related("product")
                    .order_by("product__name", "id")
                ):
                    _add(sib)
    except Exception:
        pass

    # 3. Co-linked sibling accessories from the same parent finished good
    if sibling_acc_items:
        for sib in sibling_acc_items:
            if sib and sib.id != acc.id and _is_same_accessory_family(acc, sib):
                _add(sib)

    # 4. If still single variant, discover sibling accessories in the catalog by subcategory or name family
    if len(variants) <= 1:
        try:
            from products_pim.models import PimProduct

            subcat_id = None
            pim_acc = PimProduct.objects.filter(operational_product_id=acc.product_id).first()
            if not pim_acc and getattr(acc, "product", None) and hasattr(acc.product, "pim"):
                pim_acc = acc.product.pim
            if pim_acc:
                subcat_id = pim_acc.subcategory_id

            if subcat_id:
                sib_pim_op_ids = list(
                    PimProduct.objects.filter(
                        subcategory_id=subcat_id,
                        product_type="ACCESSORY",
                    )
                    .exclude(operational_product_id__isnull=True)
                    .values_list("operational_product_id", flat=True)
                )
                if sib_pim_op_ids:
                    for sib in (
                        InventoryItem.objects.filter(
                            product_id__in=sib_pim_op_ids,
                            is_active=True,
                        )
                        .select_related("product")
                        .order_by("product__name", "id")
                    ):
                        _add(sib)

            # Name prefix family fallback (e.g. "Commercial Plyboard", "Steel Side Rail", "Side Rail")
            if len(variants) <= 1 and acc.product and acc.product.name:
                name_clean = acc.product.name.strip()
                words = name_clean.split()
                prefixes = []
                if len(words) >= 2:
                    prefixes.append(" ".join(words[:2]))
                if len(words) >= 1 and len(words[0]) >= 4:
                    prefixes.append(words[0])
                for pfx in prefixes:
                    for sib in (
                        InventoryItem.objects.filter(
                            product__name__icontains=pfx,
                            stock_item_type=InventoryItemType.ACCESSORY,
                            is_active=True,
                        )
                        .select_related("product")
                        .order_by("product__name", "id")
                    ):
                        _add(sib)
                    if len(variants) > 1:
                        break
        except Exception:
            pass

    return variants


def _collect_parent_fg_variants(inv_item: InventoryItem) -> list[dict]:
    """Return sibling PIM variants for the parent finished good so operators can compare prices/costs and switch."""
    results: list[dict] = []
    if not inv_item or not inv_item.product_id:
        return results
    try:
        from products_pim.models import ProductVariant as PimVariant

        pim_prod = None
        pv = PimVariant.objects.filter(operational_product_id=inv_item.product_id).select_related("product").first()
        if pv and pv.product_id:
            pim_prod = pv.product
        elif hasattr(inv_item.product, "pim"):
            pim_prod = inv_item.product.pim
        if not pim_prod:
            return results

        sibling_pvs = list(
            PimVariant.objects.filter(product=pim_prod, is_active=True, operational_product_id__isnull=False)
            .select_related("operational_product", "operational_product__inventory_profile")
            .prefetch_related("attribute_values__attribute")
            .order_by("sku")
        )
        for spv in sibling_pvs:
            op = spv.operational_product
            sib_inv = getattr(op, "inventory_profile", None)
            if not sib_inv or not sib_inv.is_active:
                continue
            attrs = {}
            for av in spv.attribute_values.all():
                val = av.value_text or (str(av.value_number) if av.value_number is not None else None)
                if val is None and av.value_boolean is not None:
                    val = "Yes" if av.value_boolean else "No"
                if val is not None and val != "":
                    attrs[av.attribute.name] = str(val)
            try:
                avail = sib_inv.available_qty()
            except Exception:
                avail = QUANTITY_ZERO
            results.append({
                "inventory_item_id": sib_inv.id,
                "product_id": op.id,
                "product_code": op.product_code,
                "name": op.name,
                "variant_label": spv.variant_name or op.name,
                "sku": sib_inv.sku or spv.sku,
                "base_price": str(op.base_price or "0.00"),
                "standard_unit_cost": str(sib_inv.standard_unit_cost or "0.00"),
                "purchase_unit_cost": str(sib_inv.purchase_unit_cost or sib_inv.standard_unit_cost or spv.cost_price or "0.00"),
                "available_stock": f"{avail:.3f}",
                "attributes": attrs,
                "is_current": sib_inv.id == inv_item.id,
                "is_emi_enabled": bool(getattr(op, "is_emi_enabled", False)),
                "is_rent_enabled": bool(getattr(op, "is_rent_enabled", False)),
                "is_lease_enabled": bool(getattr(op, "is_lease_enabled", False)),
                "is_direct_sale_enabled": bool(getattr(op, "is_direct_sale_enabled", False)),
            })
    except Exception:
        pass
    return results


class AdminBillingAccessoryOptionsView(APIView):
    """
    Returns the full accessory + service selection options for a finished good,
    ready to render in the purchase / billing / contract workspace.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, product_id: int):
        # Resolve product or inventory item
        inv_item = None
        item_id = request.query_params.get("item_id")
        if item_id:
            try:
                inv_item = InventoryItem.objects.select_related("product").filter(id=int(item_id)).first()
            except (ValueError, TypeError):
                pass
        if not inv_item and product_id:
            inv_item = InventoryItem.objects.select_related("product").filter(
                product_id=product_id,
                stock_item_type=InventoryItemType.FINISHED_GOOD,
            ).first()
            if not inv_item:
                inv_item = InventoryItem.objects.select_related("product").filter(
                    product_id=product_id
                ).first()

        if not inv_item:
            return Response({
                "accessory_options": [],
                "service_options": [],
                "parent_variants": [],
                "has_options": False,
            })

        # Accessory links
        links = list(
            FinishedGoodAccessoryLink.objects
            .filter(finished_good=inv_item)
            .select_related(
                "accessory__product",
                "variant_group",
                "sourcing_vendor",
            )
            .prefetch_related("variant_group__variants__product")
            .order_by("sort_order", "id")
        )

        accessory_options = []
        seen_acc_product_ids: set[int] = set()
        all_linked_accessories = [link.accessory for link in links if link.accessory_id]
        for link in links:
            s_type = getattr(link, "sourcing_type", "SUPPLIED_WITH_PARENT") or "SUPPLIED_WITH_PARENT"
            s_vendor_name = link.sourcing_vendor.name if getattr(link, "sourcing_vendor", None) else ""
            is_supplied = (s_type == "SUPPLIED_WITH_PARENT")
            iso_mode = getattr(link, "isolation_mode", "SHARED_POOL") or "SHARED_POOL"
            if link.variant_group_id:
                variants = [
                    _serialize_variant_item(v)
                    for v in link.variant_group.variants.filter(
                        stock_item_type=InventoryItemType.ACCESSORY,
                        is_active=True,
                    ).select_related("product").order_by("variant_label", "product__name")
                ]
                for v in variants:
                    seen_acc_product_ids.add(v["product_id"])
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
                    "quantity": str(getattr(link, "quantity", None) or "1.000"),
                    "sourcing_type": s_type,
                    "sourcing_type_display": "Supplied with Parent" if is_supplied else ("Outsourced" if s_type == "OUTSOURCED_SEPARATE" else "Internal Stock"),
                    "sourcing_vendor_id": link.sourcing_vendor_id,
                    "sourcing_vendor_name": s_vendor_name,
                    "is_supplied_with_parent": is_supplied,
                    "isolation_mode": iso_mode,
                    "isolation_mode_display": "Shared Pool" if iso_mode == "SHARED_POOL" else "Dedicated Kit Reserve",
                    "low_stock_warning": bool(s_type == "OUTSOURCED_SEPARATE"),
                    "stock_alert_message": f"Outsourced from {s_vendor_name}: Manual PO required if unstocked" if (s_type == "OUTSOURCED_SEPARATE") else "",
                    "notes": link.notes,
                    "sort_order": link.sort_order,
                    "variants": variants,
                    "selected_variant_id": variants[0]["id"] if variants else None,
                })
            elif link.accessory_id:
                acc = link.accessory
                if acc.product_id in seen_acc_product_ids:
                    continue
                seen_acc_product_ids.add(acc.product_id)
                variants = _collect_accessory_variants(acc, sibling_acc_items=all_linked_accessories)
                for v_item in variants:
                    seen_acc_product_ids.add(v_item["product_id"])
                    # Check if another link defined a custom price or charge mode for this variant
                    match_l = next((l for l in links if l.accessory_id and l.accessory.product_id == v_item["product_id"]), None)
                    if match_l:
                        v_item["charge_mode"] = match_l.charge_mode
                        v_item["sale_price"] = str(match_l.sale_price)
                        v_item["is_supplied_with_parent"] = (getattr(match_l, "sourcing_type", "") or "SUPPLIED_WITH_PARENT") == "SUPPLIED_WITH_PARENT"
                is_multi_variant = len(variants) > 1
                acc_stock = Decimal("0.000")
                try:
                    from inventory.services.demand_planning_service import stock_status_for_delivery
                    stk = stock_status_for_delivery(product_id=acc.product_id)
                    acc_stock = Decimal(str(stk.get("available", 0)))
                except Exception:
                    pass
                is_low_stock = bool(s_type == "OUTSOURCED_SEPARATE" and acc_stock <= Decimal("0.000"))
                # Resolve group name: use variant group name, or subcategory, or family name
                group_name = None
                if is_multi_variant:
                    group_name = acc.variant_group.name if acc.variant_group_id else (acc.product.subcategory or acc.product.name)
                accessory_options.append({
                    "link_id": link.id,
                    "link_type": "group" if is_multi_variant else "single",
                    "group_id": acc.variant_group_id,
                    "group_name": group_name,
                    "group_code": acc.variant_group.code if acc.variant_group_id else None,
                    "group_category": acc.variant_group.category if acc.variant_group_id else (acc.product.category or ""),
                    "group_subcategory": acc.variant_group.subcategory if acc.variant_group_id else (acc.product.subcategory or ""),
                    "is_required": acc.variant_group.is_required if acc.variant_group_id else False,
                    "charge_mode": link.charge_mode,
                    "sale_price": str(link.sale_price),
                    "is_default_included": link.is_default_included,
                    "quantity": str(getattr(link, "quantity", None) or "1.000"),
                    "sourcing_type": s_type,
                    "sourcing_type_display": "Supplied with Parent" if is_supplied else ("Outsourced" if s_type == "OUTSOURCED_SEPARATE" else "Internal Stock"),
                    "sourcing_vendor_id": link.sourcing_vendor_id,
                    "sourcing_vendor_name": s_vendor_name,
                    "is_supplied_with_parent": is_supplied,
                    "isolation_mode": iso_mode,
                    "isolation_mode_display": "Shared Pool" if iso_mode == "SHARED_POOL" else "Dedicated Kit Reserve",
                    "available_stock": str(acc_stock),
                    "low_stock_warning": is_low_stock,
                    "stock_alert_message": f"Outsourced from {s_vendor_name or 'vendor'}: Stock is {acc_stock} (Manual PO required)" if is_low_stock else "",
                    "accessory_inventory_item_id": acc.id,
                    "accessory_product_id": acc.product_id,
                    "accessory_name": acc.product.name,
                    "accessory_code": acc.product.product_code,
                    "accessory_sku": acc.sku,
                    "notes": link.notes,
                    "sort_order": link.sort_order,
                    "variants": variants,
                    "selected_variant_id": acc.id,
                })

        # Fallback: include any ProductRelationship(relationship_type="ACCESSORY") not yet in FinishedGoodAccessoryLink
        try:
            from products_core.models import ProductRelationship

            rel_q = Q(product_id=inv_item.product_id, parent_variant__isnull=True)
            if inv_item.sku:
                rel_q |= Q(parent_variant_sku=inv_item.sku)
            try:
                from products_pim.models import ProductVariant as PimVariant
                pv = PimVariant.objects.filter(operational_product_id=inv_item.product_id).select_related("product").first()
                if pv and pv.product and pv.product.source_product_id:
                    rel_q |= Q(product_id=pv.product.source_product_id, parent_variant__isnull=True)
            except Exception:
                pass

            pim_rels = (
                ProductRelationship.objects.filter(rel_q, relationship_type="ACCESSORY")
                .select_related("related_product", "sourcing_vendor")
                .order_by("id")
            )
            for rel in pim_rels:
                if rel.parent_variant_sku and inv_item.sku and rel.parent_variant_sku != inv_item.sku:
                    continue
                if not rel.related_product_id or rel.related_product_id in seen_acc_product_ids:
                    continue
                acc_item = None
                if rel.related_variant_sku:
                    acc_item = InventoryItem.objects.select_related("product", "variant_group").filter(sku=rel.related_variant_sku).first()
                if not acc_item:
                    acc_item = InventoryItem.objects.select_related("product", "variant_group").filter(product_id=rel.related_product_id).first()
                if not acc_item and rel.related_product:
                    try:
                        acc_item, _ = InventoryItem.objects.get_or_create(
                            product=rel.related_product,
                            defaults={
                                "sku": rel.related_product.product_code or rel.related_variant_sku or f"ACC-{rel.related_product_id}",
                                "stock_item_type": InventoryItemType.ACCESSORY,
                                "is_active": True,
                            },
                        )
                    except Exception:
                        pass
                if not acc_item:
                    continue
                seen_acc_product_ids.add(acc_item.product_id)
                variants = _collect_accessory_variants(acc_item)
                for v_item in variants:
                    seen_acc_product_ids.add(v_item["product_id"])
                    # Check if matching sibling rel had specific price or charge mode
                    match_rel = next((r for r in pim_rels if r.related_product_id == v_item["product_id"]), None)
                    if match_rel:
                        c_m = getattr(match_rel, "charge_mode", None) or ("FREE" if match_rel.is_price_included_in_parent else "CHARGEABLE")
                        v_item["charge_mode"] = c_m
                        v_item["sale_price"] = str(getattr(match_rel, "sale_price", MONEY_ZERO) if c_m == "CHARGEABLE" else MONEY_ZERO)
                s_type = getattr(rel, "sourcing_type", "SUPPLIED_WITH_PARENT") or "SUPPLIED_WITH_PARENT"
                s_vendor_name = rel.sourcing_vendor.name if getattr(rel, "sourcing_vendor", None) else ""
                is_supplied = (s_type == "SUPPLIED_WITH_PARENT")
                iso_mode = getattr(rel, "isolation_mode", "SHARED_POOL") or "SHARED_POOL"
                c_mode = getattr(rel, "charge_mode", None) or ("FREE" if rel.is_price_included_in_parent else "CHARGEABLE")
                s_price = getattr(rel, "sale_price", MONEY_ZERO) if c_mode == "CHARGEABLE" else MONEY_ZERO
                is_multi_variant = len(variants) > 1
                group_name = None
                if is_multi_variant:
                    group_name = acc_item.variant_group.name if acc_item.variant_group_id else (acc_item.product.subcategory or acc_item.product.name)
                accessory_options.append({
                    "link_id": -int(rel.id),
                    "link_type": "group" if is_multi_variant else "single",
                    "group_id": acc_item.variant_group_id,
                    "group_name": group_name,
                    "group_code": acc_item.variant_group.code if acc_item.variant_group_id else None,
                    "group_category": acc_item.product.category or "",
                    "group_subcategory": acc_item.product.subcategory or "",
                    "is_required": False,
                    "charge_mode": c_mode,
                    "sale_price": str(s_price or "0.00"),
                    "is_default_included": c_mode == "FREE",
                    "quantity": str(rel.quantity or "1.000"),
                    "sourcing_type": s_type,
                    "sourcing_type_display": "Supplied with Parent" if is_supplied else ("Outsourced" if s_type == "OUTSOURCED_SEPARATE" else "Internal Stock"),
                    "sourcing_vendor_id": rel.sourcing_vendor_id,
                    "sourcing_vendor_name": s_vendor_name,
                    "is_supplied_with_parent": is_supplied,
                    "isolation_mode": iso_mode,
                    "isolation_mode_display": "Shared Pool" if iso_mode == "SHARED_POOL" else "Dedicated Kit Reserve",
                    "low_stock_warning": bool(s_type == "OUTSOURCED_SEPARATE"),
                    "stock_alert_message": f"Outsourced from {s_vendor_name or 'vendor'}: Manual PO required if unstocked" if (s_type == "OUTSOURCED_SEPARATE") else "",
                    "accessory_inventory_item_id": acc_item.id,
                    "accessory_product_id": acc_item.product_id,
                    "accessory_name": acc_item.product.name,
                    "accessory_code": acc_item.product.product_code,
                    "accessory_sku": acc_item.sku,
                    "notes": rel.notes,
                    "sort_order": 999,
                    "variants": variants,
                    "selected_variant_id": acc_item.id,
                })
        except Exception:
            pass

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
                "service_product_id": ensure_service_product(lnk.service).id,
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

        parent_variants = _collect_parent_fg_variants(inv_item)

        return Response({
            "product_id": inv_item.product_id or product_id,
            "inventory_item_id": inv_item.id,
            "product_name": inv_item.product.name,
            "parent_variants": parent_variants,
            "accessory_options": accessory_options,
            "service_options": service_options,
            "has_options": bool(accessory_options or service_options or len(parent_variants) > 1),
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
        quantity = Decimal(str(request.data.get("quantity", "1.000") or "1.000"))

        link = FinishedGoodAccessoryLink(
            finished_good=fg,
            variant_group=group,
            charge_mode=charge_mode,
            sale_price=sale_price,
            is_default_included=is_default,
            quantity=quantity if quantity > Decimal("0.000") else Decimal("1.000"),
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
            "quantity": str(link.quantity),
        }, status=status.HTTP_201_CREATED)
