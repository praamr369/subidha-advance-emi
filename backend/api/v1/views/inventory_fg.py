"""
Finished Good Profile API
=========================
CRUD for finished-good inventory profiles, accessory links, service links.

Endpoints (all under /api/v1/admin/inventory/finished-goods/):
  GET    /                          list finished goods (paginated)
  GET    /{id}/                     profile detail + accessories + services + BOM
  POST   /{id}/accessories/         add accessory link (single item)
  POST   /{id}/accessory-groups/    add accessory group link
  PATCH  /{id}/accessories/{lid}/   update charge mode / price
  DELETE /{id}/accessories/{lid}/   remove accessory link
  POST   /{id}/services/            add service link
  PATCH  /{id}/services/{lid}/      update charge mode / price
  DELETE /{id}/services/{lid}/      remove service link
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.models import SOFT_HOLD_MOVEMENT_TYPES
from inventory.models import (
    AccessoryVariantGroup,
    FGAccessoryChargeMode,
    FGServiceChargeMode,
    FinishedGoodAccessoryLink,
    FinishedGoodServiceLink,
    InventoryItem,
    InventoryItemType,
    ServiceCatalogItem,
)
from manufacturing.models import ManufacturingBom, ManufacturingBomStatus

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")
_SOFT_HOLDS = list(SOFT_HOLD_MOVEMENT_TYPES)


def _annotate_stock_qty(qs):
    return qs.annotate(
        _ledger_in=Coalesce(
            Sum("stock_ledger__quantity_in", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO), output_field=DecimalField(),
        ),
        _ledger_out=Coalesce(
            Sum("stock_ledger__quantity_out", filter=~Q(stock_ledger__movement_type__in=_SOFT_HOLDS)),
            Value(QUANTITY_ZERO), output_field=DecimalField(),
        ),
    ).annotate(
        physical_qty=ExpressionWrapper(
            Coalesce(F("opening_stock_qty"), Value(QUANTITY_ZERO), output_field=DecimalField()) + F("_ledger_in") - F("_ledger_out"),
            output_field=DecimalField(),
        )
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _profile_dict(item: InventoryItem) -> dict:
    p = item.product
    return {
        "id": item.id,
        "product_id": p.id,
        "product_name": p.name,
        "product_code": p.product_code or "",
        "sku": item.sku or "",
        "unit_of_measure": item.unit_of_measure or "",
        "valuation_method": item.valuation_method or "FIFO",
        "standard_unit_cost": str(item.standard_unit_cost or MONEY_ZERO),
        "base_price": str(p.base_price or MONEY_ZERO),
        "reorder_level_qty": str(item.reorder_level_qty or 0),
        "stock_tracking_status": "STOCK_ACTIVE" if item.stock_tracking_enabled else "NOT_TRACKED",
        "stock_item_type": item.stock_item_type,
        "category": p.category or "",
        "subcategory": p.subcategory or "",
        "barcode": item.barcode or "",
        "is_active": item.is_active,
        "physical_qty": str(getattr(item, "physical_qty", None) or MONEY_ZERO),
    }


def _acc_link_dict(link: FinishedGoodAccessoryLink) -> dict:
    acc = link.accessory
    grp = link.variant_group
    return {
        "id": link.id,
        "accessory": acc.id if acc else None,
        "accessory_name": acc.product.name if acc else None,
        "accessory_code": acc.product.product_code if acc else None,
        "accessory_sku": acc.sku if acc else None,
        "variant_group": grp.id if grp else None,
        "variant_group_name": grp.name if grp else None,
        "charge_mode": link.charge_mode,
        "sale_price": str(link.sale_price or MONEY_ZERO),
        "is_default_included": link.is_default_included,
        "sort_order": link.sort_order,
        "notes": link.notes or "",
    }


def _svc_link_dict(link: FinishedGoodServiceLink) -> dict:
    svc = link.service
    return {
        "id": link.id,
        "service": svc.id,
        "service_name": svc.name,
        "service_code": svc.code,
        "service_type": svc.service_type,
        "service_category": svc.category or "",
        "service_standard_price": str(svc.standard_price or MONEY_ZERO),
        "service_tax_rate_percent": str(svc.tax_rate_percent or 0),
        "service_hsn_sac_code": svc.hsn_sac_code or "",
        "charge_mode": link.charge_mode,
        "sale_price": str(link.sale_price or MONEY_ZERO),
        "is_default_included": link.is_default_included,
        "sort_order": link.sort_order,
        "notes": link.notes or "",
    }


def _active_bom_dict(fg: InventoryItem) -> dict | None:
    bom = (
        ManufacturingBom.objects
        .filter(finished_good_inventory_item=fg, status=ManufacturingBomStatus.ACTIVE, is_default=True)
        .prefetch_related("lines__inventory_item__product")
        .order_by("-revision_no")
        .first()
    )
    if not bom:
        bom = (
            ManufacturingBom.objects
            .filter(finished_good_inventory_item=fg, status=ManufacturingBomStatus.ACTIVE)
            .prefetch_related("lines__inventory_item__product")
            .order_by("-revision_no")
            .first()
        )
    if not bom:
        return None
    return {
        "id": bom.id,
        "bom_no": bom.bom_no,
        "revision_no": bom.revision_no,
        "status": bom.status,
        "is_default": bom.is_default,
        "lines": [
            {
                "id": ln.id,
                "product_name": ln.inventory_item.product.name,
                "product_code": ln.inventory_item.product.product_code,
                "item_type": ln.inventory_item.stock_item_type,
                "quantity_per_unit": str(ln.quantity_per_unit),
                "wastage_percent": str(ln.wastage_percent),
                "unit_of_measure": ln.inventory_item.unit_of_measure or "",
                "notes": ln.notes or "",
            }
            for ln in bom.lines.all()
        ],
    }


def _get_fg(pk: int) -> InventoryItem:
    return get_object_or_404(
        InventoryItem.objects.select_related("product"),
        pk=pk,
        stock_item_type=InventoryItemType.FINISHED_GOOD,
    )


def _parse_decimal(val, default=MONEY_ZERO) -> Decimal:
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError):
        return default


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class FGProfileListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        search = (request.query_params.get("search") or "").strip()
        page = max(1, int(request.query_params.get("page", 1)))
        page_size = min(100, max(1, int(request.query_params.get("page_size", 25))))

        qs = _annotate_stock_qty(
            InventoryItem.objects
            .select_related("product")
            .filter(stock_item_type=InventoryItemType.FINISHED_GOOD, is_active=True)
            .order_by("product__name", "id")
        )
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(product__name__icontains=search)
                | Q(product__product_code__icontains=search)
                | Q(sku__icontains=search)
            )

        total = qs.count()
        offset = (page - 1) * page_size
        items = qs[offset: offset + page_size]

        return Response({
            "count": total,
            "results": [_profile_dict(i) for i in items],
        })


class FGProfileDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        fg = _get_fg(pk)

        acc_links = (
            FinishedGoodAccessoryLink.objects
            .filter(finished_good=fg)
            .select_related("accessory__product", "variant_group")
            .order_by("sort_order", "id")
        )
        svc_links = (
            FinishedGoodServiceLink.objects
            .filter(finished_good=fg)
            .select_related("service")
            .order_by("sort_order", "id")
        )
        bom_count = ManufacturingBom.objects.filter(finished_good_inventory_item=fg).count()

        return Response({
            "profile": _profile_dict(fg),
            "accessories": [_acc_link_dict(l) for l in acc_links],
            "services": [_svc_link_dict(l) for l in svc_links],
            "bom_count": bom_count,
            "active_bom": _active_bom_dict(fg),
        })


class FGAccessoryLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        fg = _get_fg(pk)
        data = request.data
        accessory_id = data.get("accessory")
        if not accessory_id:
            return Response({"error": "accessory is required."}, status=400)
        accessory = get_object_or_404(InventoryItem, pk=accessory_id, stock_item_type=InventoryItemType.ACCESSORY)
        charge_mode = data.get("charge_mode", FGAccessoryChargeMode.FREE)
        sale_price = _parse_decimal(data.get("sale_price", 0))

        with transaction.atomic():
            link = FinishedGoodAccessoryLink.objects.create(
                finished_good=fg,
                accessory=accessory,
                charge_mode=charge_mode,
                sale_price=sale_price if charge_mode != FGAccessoryChargeMode.FREE else MONEY_ZERO,
                is_default_included=bool(data.get("is_default_included", True)),
                sort_order=int(data.get("sort_order", 1)),
                notes=(data.get("notes") or "").strip(),
            )
        return Response(_acc_link_dict(link), status=201)


class FGAccessoryGroupLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        fg = _get_fg(pk)
        data = request.data
        group_id = data.get("variant_group")
        if not group_id:
            return Response({"error": "variant_group is required."}, status=400)
        group = get_object_or_404(AccessoryVariantGroup, pk=group_id)
        charge_mode = data.get("charge_mode", FGAccessoryChargeMode.FREE)
        sale_price = _parse_decimal(data.get("sale_price", 0))

        with transaction.atomic():
            link = FinishedGoodAccessoryLink.objects.create(
                finished_good=fg,
                variant_group=group,
                charge_mode=charge_mode,
                sale_price=sale_price if charge_mode != FGAccessoryChargeMode.FREE else MONEY_ZERO,
                is_default_included=bool(data.get("is_default_included", True)),
                sort_order=int(data.get("sort_order", 1)),
                notes=(data.get("notes") or "").strip(),
            )
        return Response(_acc_link_dict(link), status=201)


class FGAccessoryLinkDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get_link(self, pk: int, lid: int) -> FinishedGoodAccessoryLink:
        return get_object_or_404(FinishedGoodAccessoryLink, pk=lid, finished_good_id=pk)

    def patch(self, request, pk: int, lid: int):
        link = self._get_link(pk, lid)
        data = request.data
        if "charge_mode" in data:
            link.charge_mode = data["charge_mode"]
        if "sale_price" in data:
            link.sale_price = _parse_decimal(data["sale_price"])
        if link.charge_mode == FGAccessoryChargeMode.FREE:
            link.sale_price = MONEY_ZERO
        if "is_default_included" in data:
            link.is_default_included = bool(data["is_default_included"])
        if "notes" in data:
            link.notes = (data["notes"] or "").strip()
        link.full_clean()
        link.save()
        link.refresh_from_db()
        link = FinishedGoodAccessoryLink.objects.select_related("accessory__product", "variant_group").get(pk=link.pk)
        return Response(_acc_link_dict(link))

    def delete(self, request, pk: int, lid: int):
        link = self._get_link(pk, lid)
        link.delete()
        return Response(status=204)


class FGServiceLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        fg = _get_fg(pk)
        data = request.data
        service_id = data.get("service")
        if not service_id:
            return Response({"error": "service is required."}, status=400)
        svc = get_object_or_404(ServiceCatalogItem, pk=service_id)
        charge_mode = data.get("charge_mode", FGServiceChargeMode.FREE)
        sale_price = _parse_decimal(data.get("sale_price", 0))

        with transaction.atomic():
            link, created = FinishedGoodServiceLink.objects.get_or_create(
                finished_good=fg,
                service=svc,
                defaults={
                    "charge_mode": charge_mode,
                    "sale_price": sale_price if charge_mode != FGServiceChargeMode.FREE else MONEY_ZERO,
                    "is_default_included": bool(data.get("is_default_included", True)),
                    "sort_order": int(data.get("sort_order", 1)),
                    "notes": (data.get("notes") or "").strip(),
                },
            )
            if not created:
                return Response({"error": "This service is already linked to this finished good."}, status=400)
        return Response(_svc_link_dict(link), status=201)


class FGBarcodePatchView(APIView):
    """PATCH /inventory/finished-goods/<pk>/barcode/  — set or auto-generate barcode."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk: int):
        fg = _get_fg(pk)
        barcode = (request.data.get("barcode") or "").strip()
        if not barcode:
            import re, random, string
            sku = fg.sku or fg.product.product_code or ""
            slug = re.sub(r"[^A-Z0-9]", "", sku.upper())[:12]
            rand = "".join(random.choices(string.digits, k=4))
            barcode = f"BC-{slug}-{rand}" if slug else f"BC-{rand}"
        fg.barcode = barcode
        fg.save(update_fields=["barcode"])
        return Response({"barcode": fg.barcode})


class FGQuickCreateAccessoryView(APIView):
    """POST /inventory/finished-goods/<pk>/quick-create-accessory/
    Creates an ACCESSORY InventoryItem + Product and immediately links it to this FG."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        from subscriptions.models import Product
        from django.db import transaction as db_tx

        fg = _get_fg(pk)
        data = request.data

        product_name = (data.get("name") or "").strip()
        product_code = (data.get("product_code") or "").strip().upper()
        base_price = _parse_decimal(data.get("base_price", "0"))
        uom = (data.get("unit_of_measure") or "PCS").strip()
        charge_mode = data.get("charge_mode", FGAccessoryChargeMode.FREE)
        sale_price = _parse_decimal(data.get("sale_price", "0"))
        is_default_included = bool(data.get("is_default_included", True))
        sort_order = int(data.get("sort_order", 1))
        notes = (data.get("notes") or "").strip()

        if not product_name:
            return Response({"error": "name is required."}, status=400)
        if not product_code:
            return Response({"error": "product_code is required."}, status=400)

        if Product.objects.filter(product_code=product_code).exists():
            return Response({"error": f"Product code '{product_code}' already exists."}, status=400)

        with db_tx.atomic():
            product = Product.objects.create(
                name=product_name,
                product_code=product_code,
                base_price=base_price,
                is_active=True,
            )
            acc_item = InventoryItem.objects.create(
                product=product,
                stock_item_type=InventoryItemType.ACCESSORY,
                unit_of_measure=uom,
                stock_tracking_enabled=True,
                is_active=True,
            )
            link = FinishedGoodAccessoryLink.objects.create(
                finished_good=fg,
                accessory=acc_item,
                charge_mode=charge_mode,
                sale_price=sale_price if charge_mode != FGAccessoryChargeMode.FREE else MONEY_ZERO,
                is_default_included=is_default_included,
                sort_order=sort_order,
                notes=notes,
            )

        return Response({
            "accessory_item_id": acc_item.id,
            "product_code": product_code,
            "name": product_name,
            "link": _acc_link_dict(link),
        }, status=201)


class FGServiceLinkDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def _get_link(self, pk: int, lid: int) -> FinishedGoodServiceLink:
        return get_object_or_404(FinishedGoodServiceLink, pk=lid, finished_good_id=pk)

    def patch(self, request, pk: int, lid: int):
        link = self._get_link(pk, lid)
        data = request.data
        if "charge_mode" in data:
            link.charge_mode = data["charge_mode"]
        if "sale_price" in data:
            link.sale_price = _parse_decimal(data["sale_price"])
        if link.charge_mode == FGServiceChargeMode.FREE:
            link.sale_price = MONEY_ZERO
        if "is_default_included" in data:
            link.is_default_included = bool(data["is_default_included"])
        if "notes" in data:
            link.notes = (data["notes"] or "").strip()
        link.full_clean()
        link.save()
        link.refresh_from_db()
        link = FinishedGoodServiceLink.objects.select_related("service").get(pk=link.pk)
        return Response(_svc_link_dict(link))

    def delete(self, request, pk: int, lid: int):
        link = self._get_link(pk, lid)
        link.delete()
        return Response(status=204)
