"""
Admin inventory catalog views:
  - Finished Goods profile list + detail
  - Raw Materials list
  - Accessories list
  - Service Catalog CRUD
  - Finished-Good ↔ Accessory link CRUD
  - Finished-Good ↔ Service link CRUD
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from inventory.models import SOFT_HOLD_MOVEMENT_TYPES
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.models import (
    FGAccessoryChargeMode,
    FGServiceChargeMode,
    FinishedGoodAccessoryLink,
    FinishedGoodServiceLink,
    InventoryItem,
    InventoryItemType,
    ServiceCatalogItem,
    ServiceCatalogItemStatus,
    ServiceType,
)
from inventory.services.service_catalog_list_service import build_service_catalog_list

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")
_SOFT_HOLDS = list(SOFT_HOLD_MOVEMENT_TYPES)


def _annotate_stock_qty(qs):
    """Annotate queryset with physical_qty = opening + sum(in) - sum(out), excluding soft-holds."""
    return qs.annotate(
        _ledger_in=Coalesce(
            Sum("stock_ledger__quantity_in", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO),
            output_field=DecimalField(),
        ),
        _ledger_out=Coalesce(
            Sum("stock_ledger__quantity_out", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO),
            output_field=DecimalField(),
        ),
    ).annotate(
        physical_qty=ExpressionWrapper(
            Coalesce(F("opening_stock_qty"), Value(QUANTITY_ZERO), output_field=DecimalField()) + F("_ledger_in") - F("_ledger_out"),
            output_field=DecimalField(),
        )
    )


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

class ServiceCatalogItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCatalogItem
        fields = [
            "id", "code", "name", "description", "category", "service_type",
            "standard_price", "tax_rate_percent", "status",
            "hsn_sac_code", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ServiceCatalogItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCatalogItem
        fields = [
            "code", "name", "description", "category", "service_type",
            "standard_price", "tax_rate_percent", "status",
            "hsn_sac_code", "notes",
        ]


class FGAccessoryLinkSerializer(serializers.ModelSerializer):
    accessory_id = serializers.IntegerField(source="accessory.id", read_only=True)
    accessory_name = serializers.CharField(source="accessory.product.name", read_only=True)
    accessory_sku = serializers.CharField(source="accessory.sku", read_only=True, allow_null=True)
    accessory_code = serializers.CharField(source="accessory.product.product_code", read_only=True)
    accessory_inv_id = serializers.IntegerField(source="accessory.id", read_only=True)

    class Meta:
        model = FinishedGoodAccessoryLink
        fields = [
            "id", "finished_good", "accessory", "accessory_id",
            "accessory_name", "accessory_sku", "accessory_code", "accessory_inv_id",
            "charge_mode", "sale_price", "is_default_included", "quantity",
            "sort_order", "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "accessory_id", "accessory_name", "accessory_sku",
            "accessory_code", "accessory_inv_id", "created_at", "updated_at",
        ]


class FGAccessoryLinkWriteSerializer(serializers.Serializer):
    accessory = serializers.PrimaryKeyRelatedField(
        queryset=InventoryItem.objects.filter(stock_item_type=InventoryItemType.ACCESSORY),
    )
    charge_mode = serializers.ChoiceField(choices=FGAccessoryChargeMode.choices, default=FGAccessoryChargeMode.FREE)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO, min_value=MONEY_ZERO)
    is_default_included = serializers.BooleanField(default=True)
    quantity = serializers.DecimalField(max_digits=8, decimal_places=3, default=Decimal("1.000"), min_value=Decimal("0.001"), required=False)
    sort_order = serializers.IntegerField(default=1, min_value=1)
    notes = serializers.CharField(max_length=255, allow_blank=True, default="")

    def validate(self, attrs):
        mode = attrs.get("charge_mode", FGAccessoryChargeMode.FREE)
        price = attrs.get("sale_price", MONEY_ZERO)
        if mode == FGAccessoryChargeMode.CHARGEABLE and (price is None or price <= MONEY_ZERO):
            raise serializers.ValidationError({"sale_price": "Sale price is required when charge mode is Chargeable."})
        if mode == FGAccessoryChargeMode.FREE:
            attrs["sale_price"] = MONEY_ZERO
        return attrs


class FGServiceLinkSerializer(serializers.ModelSerializer):
    service_code = serializers.CharField(source="service.code", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    service_category = serializers.CharField(source="service.category", read_only=True)
    service_type = serializers.CharField(source="service.service_type", read_only=True)
    service_standard_price = serializers.DecimalField(
        source="service.standard_price", max_digits=12, decimal_places=2, read_only=True,
    )
    service_hsn_sac_code = serializers.CharField(source="service.hsn_sac_code", read_only=True)
    service_tax_rate_percent = serializers.DecimalField(
        source="service.tax_rate_percent", max_digits=5, decimal_places=2, read_only=True,
    )

    class Meta:
        model = FinishedGoodServiceLink
        fields = [
            "id", "finished_good", "service",
            "service_code", "service_name", "service_category", "service_type",
            "service_standard_price", "service_hsn_sac_code", "service_tax_rate_percent",
            "charge_mode", "sale_price", "is_default_included",
            "sort_order", "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "service_code", "service_name", "service_category", "service_type",
            "service_standard_price", "service_hsn_sac_code", "service_tax_rate_percent",
            "created_at", "updated_at",
        ]


class FGServiceLinkWriteSerializer(serializers.Serializer):
    service = serializers.PrimaryKeyRelatedField(
        queryset=ServiceCatalogItem.objects.filter(status=ServiceCatalogItemStatus.ACTIVE),
    )
    charge_mode = serializers.ChoiceField(choices=FGServiceChargeMode.choices, default=FGServiceChargeMode.FREE)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO, min_value=MONEY_ZERO)
    is_default_included = serializers.BooleanField(default=True)
    sort_order = serializers.IntegerField(default=1, min_value=1)
    notes = serializers.CharField(max_length=255, allow_blank=True, default="")

    def validate(self, attrs):
        mode = attrs.get("charge_mode", FGServiceChargeMode.FREE)
        if mode == FGServiceChargeMode.FREE:
            attrs["sale_price"] = MONEY_ZERO
        return attrs


def _inventory_item_summary(
    item: InventoryItem,
    *,
    reserved_qty: Decimal | None = None,
    location_breakdown: list[dict] | None = None,
) -> dict:
    from inventory.services.stock_on_hand_service import (
        _resolve_category_and_subcategory,
        _resolve_item_pricing,
        _resolve_pim_product,
        extract_inventory_item_attributes,
    )

    prod = item.product
    physical_qty = getattr(item, "physical_qty", None)
    if physical_qty is None:
        physical_qty = item.current_stock_quantity()
    physical_dec = Decimal(str(physical_qty or "0"))
    reserved_dec = reserved_qty if reserved_qty is not None else item.reserved_qty()
    available_dec = max(QUANTITY_ZERO, physical_dec - reserved_dec)
    cost, price = _resolve_item_pricing(item)
    valuation_total = (physical_dec * cost).quantize(Decimal("0.01")) if physical_dec > QUANTITY_ZERO else MONEY_ZERO
    cat_name, subcat_name = _resolve_category_and_subcategory(item)
    attrs_map = extract_inventory_item_attributes(item)
    attrs_list = [{"name": k, "value": v} for k, v in attrs_map.items()]
    pim_var = getattr(prod, "pim_variant", None)
    pim_prod = _resolve_pim_product(prod)
    brand = (getattr(pim_var, "brand", "") or "").strip() or (getattr(prod, "brand", "") or "").strip() or (getattr(pim_prod, "brand", "") or "").strip()

    return {
        "id": item.id,
        "product_id": prod.id,
        "pim_product_id": pim_prod.id if pim_prod else None,
        "product_code": prod.product_code,
        "product_name": getattr(pim_var, "variant_name", "") or prod.name,
        "brand": brand,
        "sku": item.sku,
        "stock_item_type": item.stock_item_type,
        "unit_of_measure": item.unit_of_measure,
        "stock_tracking_enabled": item.stock_tracking_enabled,
        "stock_tracking_status": InventoryItem.live_stock_tracking_status(item.stock_tracking_status, physical_qty),
        "standard_unit_cost": str(item.standard_unit_cost or cost or "0.00"),
        "reorder_level_qty": str(item.reorder_level_qty),
        "valuation_method": item.valuation_method,
        "barcode": item.barcode,
        "is_active": getattr(prod, "is_active", True),
        "category": cat_name if cat_name != "Uncategorized" else "",
        "subcategory": subcat_name,
        "base_price": str(price),
        "physical_qty": str(physical_dec),
        "reserved_qty": str(reserved_dec),
        "available_qty": str(available_dec),
        "valuation_total": str(valuation_total),
        "attributes": attrs_list,
        "attributes_map": attrs_map,
        "default_location_name": item.default_stock_location.name if item.default_stock_location_id else None,
        "location_breakdown": location_breakdown if location_breakdown is not None else [],
        "variant_group": item.variant_group_id,
        "variant_group_name": item.variant_group.name if item.variant_group_id else None,
        "variant_group_code": item.variant_group.code if item.variant_group_id else None,
        "variant_label": item.variant_label or "",
    }


def _filtered_catalog_list(request, *, item_type: str, extra_row_fn):
    from inventory.services.stock_on_hand_service import (
        _apply_sort,
        _build_location_breakdown_map,
        _build_reserved_map,
        _item_matches_attributes,
        _parse_attribute_filters,
        _resolve_item_pricing,
    )
    from inventory.services.stock_service import attach_bulk_stock_quantities

    loc_raw = (request.query_params.get("location_id") or "").strip()
    location_id = int(loc_raw) if loc_raw.isdigit() else None

    qs = (
        InventoryItem.objects
        .filter(stock_item_type=item_type)
        .select_related(
            "product",
            "product__category_master",
            "product__subcategory_master",
            "product__pim_variant",
            "product__pim_variant__product",
            "product__pim_variant__product__category",
            "product__pim_variant__product__subcategory",
            "default_stock_location",
            "variant_group",
        )
        .prefetch_related(
            "accessory_links",
            "service_links",
            "product__pim_variant__attribute_values__attribute",
            "product__pim__category",
            "product__pim__subcategory",
            "product__pim__attributes__attribute",
        )
        .order_by("product__name", "id")
    )
    qs = _annotate_stock_qty(qs)

    q = (request.query_params.get("q") or request.query_params.get("search") or "").strip()
    if q:
        qs = qs.filter(
            Q(product__name__icontains=q)
            | Q(product__product_code__icontains=q)
            | Q(sku__icontains=q)
            | Q(barcode__icontains=q)
            | Q(variant_label__icontains=q)
            | Q(variant_group__name__icontains=q)
            | Q(product__category__icontains=q)
            | Q(product__subcategory__icontains=q)
            | Q(product__base_specs__icontains=q)
            | Q(product__pim_variant__attribute_values__value_text__icontains=q)
            | Q(product__pim__attributes__value_text__icontains=q)
        ).distinct()

    tracking_status = (request.query_params.get("tracking_status") or "").strip().upper()
    if tracking_status:
        qs = qs.filter(stock_tracking_status=tracking_status)

    category = (request.query_params.get("category") or "").strip()
    if category and category != "ALL":
        qs = qs.filter(
            Q(product__category__iexact=category)
            | Q(product__category_master__name__iexact=category)
            | Q(product__pim_variant__product__category__name__iexact=category)
            | Q(product__pim__category__name__iexact=category)
        ).distinct()

    subcategory = (request.query_params.get("subcategory") or "").strip()
    if subcategory and subcategory != "ALL":
        qs = qs.filter(
            Q(product__subcategory__iexact=subcategory)
            | Q(product__subcategory_master__name__iexact=subcategory)
            | Q(product__pim_variant__product__subcategory__name__iexact=subcategory)
            | Q(product__pim__subcategory__name__iexact=subcategory)
        ).distinct()

    stock_status = (request.query_params.get("stock_status") or "").strip().lower()
    if stock_status == "in_stock":
        qs = qs.filter(physical_qty__gt=QUANTITY_ZERO)
    elif stock_status == "low_stock":
        qs = qs.filter(physical_qty__gt=QUANTITY_ZERO, physical_qty__lte=F("reorder_level_qty"), reorder_level_qty__gt=QUANTITY_ZERO)
    elif stock_status == "out_of_stock":
        qs = qs.filter(physical_qty__lte=QUANTITY_ZERO)

    attr_pairs = _parse_attribute_filters(
        attribute_key=(request.query_params.get("attribute_key") or "").strip(),
        attribute_value=(request.query_params.get("attribute_value") or "").strip(),
        attribute_filters=(request.query_params.get("attribute_filters") or "").strip() or None,
    )
    items_all = list(qs)
    if attr_pairs:
        items_all = [it for it in items_all if _item_matches_attributes(it, attr_pairs)]

    reserved_map = _build_reserved_map(item_ids=[it.id for it in items_all], location_id=location_id)
    sort_by = (request.query_params.get("sort_by") or "").strip()
    if sort_by:
        items_all = _apply_sort(items_all, sort_by, reserved_map)

    # Summary KPIs over all filtered items
    tot_phys = QUANTITY_ZERO
    tot_res = QUANTITY_ZERO
    tot_avail = QUANTITY_ZERO
    tot_val = MONEY_ZERO
    in_stock_cnt = 0
    low_stock_cnt = 0
    out_of_stock_cnt = 0

    for it in items_all:
        p = Decimal(str(getattr(it, "physical_qty", 0) or 0))
        r = reserved_map.get(it.id, QUANTITY_ZERO)
        a = max(QUANTITY_ZERO, p - r)
        reord = Decimal(str(it.reorder_level_qty or 0))
        cost, _ = _resolve_item_pricing(it)
        tot_phys += p
        tot_res += r
        tot_avail += a
        if p > QUANTITY_ZERO:
            tot_val += (p * cost).quantize(Decimal("0.01"))
        if p <= QUANTITY_ZERO:
            out_of_stock_cnt += 1
        elif reord > QUANTITY_ZERO and p <= reord:
            low_stock_cnt += 1
        else:
            in_stock_cnt += 1

    page = max(1, int(request.query_params.get("page", 1)))
    page_size = min(100, max(10, int(request.query_params.get("page_size", 20))))
    offset = (page - 1) * page_size
    total = len(items_all)
    page_items = items_all[offset: offset + page_size]

    attach_bulk_stock_quantities(page_items)
    loc_map = _build_location_breakdown_map([it.id for it in page_items])

    results = []
    for it in page_items:
        d = _inventory_item_summary(
            it,
            reserved_qty=reserved_map.get(it.id, QUANTITY_ZERO),
            location_breakdown=loc_map.get(it.id, []),
        )
        extra_row_fn(it, d)
        results.append(d)

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "num_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_skus": total,
            "in_stock_count": in_stock_cnt,
            "low_stock_count": low_stock_cnt,
            "out_of_stock_count": out_of_stock_cnt,
            "total_physical_qty": str(tot_phys),
            "total_reserved_qty": str(tot_res),
            "total_available_qty": str(tot_avail),
            "total_value": str(tot_val),
        },
        "results": results,
    }


def _paginate(queryset, request, serializer_fn):
    page = max(1, int(request.query_params.get("page", 1)))
    page_size = min(100, max(10, int(request.query_params.get("page_size", 20))))
    offset = (page - 1) * page_size
    total = queryset.count()
    items = queryset[offset: offset + page_size]
    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "num_pages": max(1, (total + page_size - 1) // page_size),
        "results": [serializer_fn(i) for i in items],
    }


# ---------------------------------------------------------------------------
# Service Catalog CRUD
# ---------------------------------------------------------------------------

class AdminServiceCatalogListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        # Get filter params
        search = (request.query_params.get("q") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip().upper()
        category = (request.query_params.get("category") or "").strip()
        service_type = (request.query_params.get("service_type") or "").strip().upper()

        # Build the service catalog list with KPI aggregation
        payload = build_service_catalog_list(
            search=search if search else None,
            status=status_filter if status_filter else None,
            category=category if category else None,
            service_type=service_type if service_type else None,
            page=page,
            page_size=page_size,
        )

        return Response(payload)

    @transaction.atomic
    def post(self, request):
        ser = ServiceCatalogItemWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        item = ServiceCatalogItem(**ser.validated_data)
        item.save()
        return Response(ServiceCatalogItemSerializer(item).data, status=status.HTTP_201_CREATED)


class AdminServiceCatalogDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get(self, pk):
        return get_object_or_404(ServiceCatalogItem, pk=pk)

    def get(self, request, pk):
        return Response(ServiceCatalogItemSerializer(self._get(pk)).data)

    @transaction.atomic
    def patch(self, request, pk):
        item = self._get(pk)
        ser = ServiceCatalogItemWriteSerializer(item, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            setattr(item, k, v)
        item.save()
        return Response(ServiceCatalogItemSerializer(item).data)

    @transaction.atomic
    def delete(self, request, pk):
        item = self._get(pk)
        if item.finished_good_links.exists():
            return Response(
                {"detail": "Cannot delete: service is linked to finished goods."},
                status=status.HTTP_409_CONFLICT,
            )
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Service type choices endpoint (for frontend dropdowns)
# ---------------------------------------------------------------------------

class AdminServiceTypeChoicesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({
            "service_types": [{"value": v, "label": l} for v, l in ServiceType.choices],
        })


# ---------------------------------------------------------------------------
# Finished Goods — list + profile detail
# ---------------------------------------------------------------------------

class AdminFinishedGoodsListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        def _extra(item, d):
            d["accessory_count"] = item.accessory_links.count()
            d["service_count"] = item.service_links.count()
            d["has_bom"] = hasattr(item, "manufacturing_boms") and item.manufacturing_boms.filter(status="ACTIVE").exists()

        return Response(_filtered_catalog_list(request, item_type=InventoryItemType.FINISHED_GOOD, extra_row_fn=_extra))


class AdminFinishedGoodProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        item = get_object_or_404(
            InventoryItem.objects
            .select_related("product", "product__category_master", "product__subcategory_master", "default_stock_location")
            .prefetch_related(
                "accessory_links__accessory__product",
                "service_links__service",
                "manufacturing_boms__lines__inventory_item__product",
            ),
            pk=pk,
            stock_item_type=InventoryItemType.FINISHED_GOOD,
        )
        accessories = [FGAccessoryLinkSerializer(lnk).data for lnk in item.accessory_links.all()]
        services = [FGServiceLinkSerializer(lnk).data for lnk in item.service_links.all()]
        active_bom = None
        for bom in item.manufacturing_boms.all():
            if bom.status == "ACTIVE" and bom.is_default:
                active_bom = {
                    "id": bom.id,
                    "bom_no": bom.bom_no,
                    "revision_no": bom.revision_no,
                    "status": bom.status,
                    "lines": [
                        {
                            "id": ln.id,
                            "inventory_item_id": ln.inventory_item_id,
                            "product_name": ln.inventory_item.product.name,
                            "product_code": ln.inventory_item.product.product_code,
                            "item_type": ln.inventory_item.stock_item_type,
                            "quantity_per_unit": str(ln.quantity_per_unit),
                            "wastage_percent": str(ln.wastage_percent),
                            "unit_of_measure": ln.inventory_item.unit_of_measure,
                        }
                        for ln in bom.lines.all()
                    ],
                }
                break

        return Response({
            "profile": _inventory_item_summary(item),
            "accessories": accessories,
            "services": services,
            "active_bom": active_bom,
            "bom_count": item.manufacturing_boms.count(),
        })


# ---------------------------------------------------------------------------
# Raw Materials list
# ---------------------------------------------------------------------------

class AdminRawMaterialsListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        def _extra(item, d):
            d["bom_usage_count"] = item.manufacturing_bom_lines.count()

        return Response(_filtered_catalog_list(request, item_type=InventoryItemType.RAW_MATERIAL, extra_row_fn=_extra))


class AdminRawMaterialDetailView(APIView):
    """PATCH/DELETE a single raw material inventory item."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get(self, pk):
        return get_object_or_404(
            InventoryItem.objects.select_related("product"),
            pk=pk, stock_item_type=InventoryItemType.RAW_MATERIAL,
        )

    def get(self, request, pk):
        item = self._get(pk)
        d = _inventory_item_summary(item)
        d["bom_usage_count"] = item.manufacturing_bom_lines.count()
        return Response(d)

    @transaction.atomic
    def patch(self, request, pk):
        item = self._get(pk)
        data = request.data
        prod = item.product
        if "name" in data:
            prod.name = (data["name"] or "").strip()
        if "base_price" in data:
            from decimal import Decimal, InvalidOperation
            try:
                prod.base_price = Decimal(str(data["base_price"]))
            except (InvalidOperation, TypeError):
                pass
        if "category" in data:
            prod.category = (data["category"] or "").strip()
        if "subcategory" in data:
            prod.subcategory = (data["subcategory"] or "").strip()
        if "is_active" in data:
            prod.is_active = bool(data["is_active"])
        prod.save(update_fields=["name", "base_price", "category", "subcategory", "is_active"])
        if "unit_of_measure" in data:
            item.unit_of_measure = (data["unit_of_measure"] or "").strip()
        if "standard_unit_cost" in data:
            from decimal import Decimal, InvalidOperation
            try:
                item.standard_unit_cost = Decimal(str(data["standard_unit_cost"]))
            except (InvalidOperation, TypeError):
                pass
        if "reorder_level_qty" in data:
            from decimal import Decimal, InvalidOperation
            try:
                item.reorder_level_qty = Decimal(str(data["reorder_level_qty"]))
            except (InvalidOperation, TypeError):
                pass
        if "barcode" in data:
            item.barcode = (data["barcode"] or "").strip() or None
        if "is_active" in data:
            item.is_active = bool(data["is_active"])
        item.save()
        d = _inventory_item_summary(item)
        d["bom_usage_count"] = item.manufacturing_bom_lines.count()
        return Response(d)

    @transaction.atomic
    def delete(self, request, pk):
        item = self._get(pk)
        if item.manufacturing_bom_lines.exists():
            return Response(
                {"detail": "Cannot delete: raw material is used in one or more BOMs."},
                status=status.HTTP_409_CONFLICT,
            )
        product = item.product
        item.delete()
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Accessories list
# ---------------------------------------------------------------------------

class AdminAccessoriesListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        def _extra(item, d):
            d["linked_fg_count"] = item.linked_to_finished_goods.count()

        return Response(_filtered_catalog_list(request, item_type=InventoryItemType.ACCESSORY, extra_row_fn=_extra))


class AdminAccessoryDetailView(APIView):
    """PATCH/DELETE a single accessory inventory item."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get(self, pk):
        return get_object_or_404(
            InventoryItem.objects.select_related("product", "variant_group"),
            pk=pk, stock_item_type=InventoryItemType.ACCESSORY,
        )

    def get(self, request, pk):
        item = self._get(pk)
        d = _inventory_item_summary(item)
        fg_links = item.linked_to_finished_goods.select_related("finished_good__product").all()
        d["linked_fg_count"] = fg_links.count()
        d["linked_finished_goods"] = [
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
                "notes": lnk.notes,
            }
            for lnk in fg_links
        ]
        return Response(d)

    @transaction.atomic
    def patch(self, request, pk):
        item = self._get(pk)
        data = request.data
        prod = item.product
        if "name" in data:
            prod.name = (data["name"] or "").strip()
        if "base_price" in data:
            from decimal import Decimal, InvalidOperation
            try:
                prod.base_price = Decimal(str(data["base_price"]))
            except (InvalidOperation, TypeError):
                pass
        if "category" in data:
            prod.category = (data["category"] or "").strip()
        if "subcategory" in data:
            prod.subcategory = (data["subcategory"] or "").strip()
        if "is_active" in data:
            prod.is_active = bool(data["is_active"])
        prod.save(update_fields=["name", "base_price", "category", "subcategory", "is_active"])
        if "unit_of_measure" in data:
            item.unit_of_measure = (data["unit_of_measure"] or "PCS").strip()
        if "standard_unit_cost" in data:
            from decimal import Decimal, InvalidOperation
            try:
                item.standard_unit_cost = Decimal(str(data["standard_unit_cost"]))
            except (InvalidOperation, TypeError):
                pass
        if "reorder_level_qty" in data:
            from decimal import Decimal, InvalidOperation
            try:
                item.reorder_level_qty = Decimal(str(data["reorder_level_qty"]))
            except (InvalidOperation, TypeError):
                pass
        if "barcode" in data:
            item.barcode = (data["barcode"] or "").strip() or None
        if "is_active" in data:
            item.is_active = bool(data["is_active"])
        if "variant_group" in data:
            vg_id = data["variant_group"]
            if vg_id:
                from inventory.models import AccessoryVariantGroup
                item.variant_group = get_object_or_404(AccessoryVariantGroup, pk=vg_id)
            else:
                item.variant_group = None
        if "variant_label" in data:
            item.variant_label = (data["variant_label"] or "").strip()
        item.save()
        return self.get(request, pk)

    @transaction.atomic
    def delete(self, request, pk):
        item = self._get(pk)
        if item.linked_to_finished_goods.exists():
            return Response(
                {"detail": "Cannot delete: accessory is linked to one or more finished goods."},
                status=status.HTTP_409_CONFLICT,
            )
        product = item.product
        item.delete()
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# FG Accessory Links CRUD
# ---------------------------------------------------------------------------

class AdminFGAccessoryLinksView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _fg(self, fg_pk):
        return get_object_or_404(InventoryItem, pk=fg_pk, stock_item_type=InventoryItemType.FINISHED_GOOD)

    def get(self, request, fg_pk):
        self._fg(fg_pk)
        links = FinishedGoodAccessoryLink.objects.filter(finished_good_id=fg_pk).select_related(
            "accessory__product"
        )
        return Response([FGAccessoryLinkSerializer(lnk).data for lnk in links])

    @transaction.atomic
    def post(self, request, fg_pk):
        fg = self._fg(fg_pk)
        ser = FGAccessoryLinkWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if FinishedGoodAccessoryLink.objects.filter(finished_good=fg, accessory=d["accessory"]).exists():
            return Response({"detail": "This accessory is already linked to the finished good."}, status=status.HTTP_409_CONFLICT)
        link = FinishedGoodAccessoryLink(finished_good=fg, **d)
        link.save()
        return Response(FGAccessoryLinkSerializer(link).data, status=status.HTTP_201_CREATED)


class AdminFGAccessoryLinkDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _link(self, fg_pk, pk):
        return get_object_or_404(FinishedGoodAccessoryLink, pk=pk, finished_good_id=fg_pk)

    @transaction.atomic
    def patch(self, request, fg_pk, pk):
        link = self._link(fg_pk, pk)
        ser = FGAccessoryLinkWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            if k != "accessory":
                setattr(link, k, v)
        link.save()
        return Response(FGAccessoryLinkSerializer(link).data)

    @transaction.atomic
    def delete(self, request, fg_pk, pk):
        link = self._link(fg_pk, pk)
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# FG Service Links CRUD
# ---------------------------------------------------------------------------

class AdminFGServiceLinksView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _fg(self, fg_pk):
        return get_object_or_404(InventoryItem, pk=fg_pk, stock_item_type=InventoryItemType.FINISHED_GOOD)

    def get(self, request, fg_pk):
        self._fg(fg_pk)
        links = FinishedGoodServiceLink.objects.filter(finished_good_id=fg_pk).select_related("service")
        return Response([FGServiceLinkSerializer(lnk).data for lnk in links])

    @transaction.atomic
    def post(self, request, fg_pk):
        fg = self._fg(fg_pk)
        ser = FGServiceLinkWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if FinishedGoodServiceLink.objects.filter(finished_good=fg, service=d["service"]).exists():
            return Response({"detail": "This service is already linked to the finished good."}, status=status.HTTP_409_CONFLICT)
        link = FinishedGoodServiceLink(finished_good=fg, **d)
        link.save()
        return Response(FGServiceLinkSerializer(link).data, status=status.HTTP_201_CREATED)


class AdminFGServiceLinkDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _link(self, fg_pk, pk):
        return get_object_or_404(FinishedGoodServiceLink, pk=pk, finished_good_id=fg_pk)

    @transaction.atomic
    def patch(self, request, fg_pk, pk):
        link = self._link(fg_pk, pk)
        ser = FGServiceLinkWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            if k != "service":
                setattr(link, k, v)
        link.save()
        return Response(FGServiceLinkSerializer(link).data)

    @transaction.atomic
    def delete(self, request, fg_pk, pk):
        link = self._link(fg_pk, pk)
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Unified Inventory Overview — all types in one call
# ---------------------------------------------------------------------------

class AdminInventoryOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from django.db.models import Count
        fg_count = InventoryItem.objects.filter(stock_item_type=InventoryItemType.FINISHED_GOOD).count()
        rm_count = InventoryItem.objects.filter(stock_item_type=InventoryItemType.RAW_MATERIAL).count()
        acc_count = InventoryItem.objects.filter(stock_item_type=InventoryItemType.ACCESSORY).count()
        svc_count = ServiceCatalogItem.objects.filter(status=ServiceCatalogItemStatus.ACTIVE).count()
        acc_links = FinishedGoodAccessoryLink.objects.count()
        svc_links = FinishedGoodServiceLink.objects.count()
        return Response({
            "finished_goods": fg_count,
            "raw_materials": rm_count,
            "accessories": acc_count,
            "active_services": svc_count,
            "accessory_links": acc_links,
            "service_links": svc_links,
        })
