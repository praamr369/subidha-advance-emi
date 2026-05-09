from __future__ import annotations

from decimal import Decimal

from django.db.models import Q
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCashierOrAdmin
from billing.models import DirectSale
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
from billing.models import DirectSaleLine
from inventory.models import InventoryItem, PurchaseNeed, PurchaseNeedStatus
from subscriptions.models import Product


def _as_decimal(value, fallback: str = "0") -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(fallback)


def _as_int(value, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _product_search_queryset(query: str):
    queryset = Product.objects.select_related("inventory_profile").order_by("name", "id")
    if not query:
        return queryset
    base_query = (
        Q(name__icontains=query)
        | Q(product_code__icontains=query)
        | Q(sku__icontains=query)
        | Q(category__icontains=query)
        | Q(subcategory__icontains=query)
    )
    if query.isdigit():
        base_query = base_query | Q(id=int(query))
    return queryset.filter(base_query)


def _inventory_payload(product: Product) -> dict:
    item = getattr(product, "inventory_profile", None)
    if item is None:
        return {
            "on_hand": "0.000",
            "reserved": "0.000",
            "available": "0.000",
            "incoming": "0.000",
            "is_in_stock": False,
            "requires_purchase": True,
        }
    on_hand = item.current_stock_quantity()
    reserved = item.reserved_qty()
    available = item.available_qty()
    incoming = Decimal("0.000")
    return {
        "on_hand": f"{on_hand:.3f}",
        "reserved": f"{reserved:.3f}",
        "available": f"{available:.3f}",
        "incoming": f"{incoming:.3f}",
        "is_in_stock": available > Decimal("0"),
        "requires_purchase": available <= Decimal("0"),
    }


def _last_sale_price(product_id: int) -> str | None:
    row = (
        DirectSaleLine.objects.filter(product_id=product_id)
        .exclude(unit_price__isnull=True)
        .order_by("-id")
        .values_list("unit_price", flat=True)
        .first()
    )
    return str(row) if row is not None else None


def _serialize_product_row(product: Product, *, include_extended: bool) -> dict:
    inventory = _inventory_payload(product)
    payload = {
        "id": product.id,
        "name": product.name,
        "product_code": product.product_code,
        "sku": product.sku,
        "category": product.category,
        "subcategory": product.subcategory,
        "base_price": str(product.base_price),
        "sale_price": str(product.base_price),
        "image": product.image.url if getattr(product, "image", None) else None,
        "is_active": product.is_active,
        "is_direct_sale_enabled": bool(getattr(product, "is_direct_sale_enabled", False)),
        "inventory_status": inventory,
        "last_sale_price": _last_sale_price(product.id),
    }
    if include_extended:
        payload["lifecycle_status"] = getattr(product, "lifecycle_status", None)
    return payload


class _DirectSalePreviewLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))
    tax_rate = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, default=Decimal("0.00"))


class _DirectSalePreviewSerializer(serializers.Serializer):
    lines = _DirectSalePreviewLineSerializer(many=True, allow_empty=False)
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))


class AdminBillingProductSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        stock_filter = (request.query_params.get("stock") or "all").strip().lower()
        include_inactive = request.query_params.get("include_inactive") in {"1", "true", "yes"}
        include_inventory = request.query_params.get("include_inventory") in {"1", "true", "yes"}
        is_direct_sale_enabled = request.query_params.get("direct_sale_enabled")
        page = max(_as_int(request.query_params.get("page"), 1), 1)
        page_size = min(max(_as_int(request.query_params.get("page_size"), 25), 1), 100)
        queryset = _product_search_queryset(q)
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
        if is_direct_sale_enabled in {"1", "true", "yes"}:
            queryset = queryset.filter(is_direct_sale_enabled=True)

        rows = []
        start = (page - 1) * page_size
        end = start + page_size
        for product in queryset[start:end]:
            row = _serialize_product_row(product, include_extended=True)
            in_stock = bool(row["inventory_status"]["is_in_stock"])
            available = _as_decimal(row["inventory_status"]["available"], "0")
            if stock_filter == "in_stock" and not in_stock:
                continue
            if stock_filter == "low_stock" and not (available > Decimal("0") and available <= Decimal("5")):
                continue
            if stock_filter == "out_of_stock" and in_stock:
                continue
            if include_inventory:
                inventory_item = getattr(product, "inventory_profile", None)
                row["inventory_item_id"] = getattr(inventory_item, "id", None)
                row["current_stock_qty"] = row["inventory_status"]["available"]
                row["stock_tracking_enabled"] = bool(getattr(inventory_item, "stock_tracking_enabled", False))
                row["delivery_stock_bridge_enabled"] = bool(getattr(inventory_item, "delivery_stock_bridge_enabled", False))
                row["inventory_ready"] = bool(inventory_item is not None)
                row["is_emi_enabled"] = bool(getattr(product, "is_emi_enabled", False))
                row["is_rent_enabled"] = bool(getattr(product, "is_rent_enabled", False))
                row["is_lease_enabled"] = bool(getattr(product, "is_lease_enabled", False))
            rows.append(row)
        return Response({"count": queryset.count(), "page": page, "page_size": page_size, "results": rows})


class CashierBillingProductSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        stock_filter = (request.query_params.get("stock") or "all").strip().lower()
        queryset = _product_search_queryset(q).filter(is_active=True, is_direct_sale_enabled=True)

        rows = []
        for product in queryset[:100]:
            row = _serialize_product_row(product, include_extended=False)
            in_stock = bool(row["inventory_status"]["is_in_stock"])
            available = _as_decimal(row["inventory_status"]["available"], "0")
            if stock_filter == "in_stock" and not in_stock:
                continue
            if stock_filter == "low_stock" and not (available > Decimal("0") and available <= Decimal("5")):
                continue
            if stock_filter == "out_of_stock" and in_stock:
                continue
            rows.append(row)
        return Response({"count": len(rows), "results": rows})


class _BaseDirectSalePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = _DirectSalePreviewSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        lines = serializer.validated_data["lines"]
        paid_amount = serializer.validated_data.get("paid_amount") or Decimal("0.00")

        product_map = {
            p.id: p
            for p in Product.objects.select_related("inventory_profile").filter(
                id__in=[line["product_id"] for line in lines]
            )
        }
        preview_lines = []
        subtotal = Decimal("0.00")
        discount_total = Decimal("0.00")
        tax_total = Decimal("0.00")
        grand_total = Decimal("0.00")
        stock_warnings = []
        requirements_preview = []
        for line in lines:
            product = product_map.get(line["product_id"])
            if product is None:
                raise serializers.ValidationError({"lines": [f"Unknown product_id: {line['product_id']}"]})
            quantity = line["quantity"]
            unit_price = line["unit_price"]
            discount_amount = line.get("discount_amount") or Decimal("0.00")
            tax_rate = line.get("tax_rate") or Decimal("0.00")

            line_subtotal = (quantity * unit_price).quantize(Decimal("0.01"))
            taxable = max(Decimal("0.00"), (line_subtotal - discount_amount).quantize(Decimal("0.01")))
            line_tax = (taxable * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            line_total = (taxable + line_tax).quantize(Decimal("0.01"))

            subtotal += line_subtotal
            discount_total += discount_amount
            tax_total += line_tax
            grand_total += line_total

            inventory_item = getattr(product, "inventory_profile", None)
            available = inventory_item.available_qty() if inventory_item is not None else Decimal("0")
            shortage = max(Decimal("0"), quantity - available)
            if shortage > Decimal("0"):
                stock_warnings.append(
                    {
                        "product_id": product.id,
                        "product_name": product.name,
                        "requested_quantity": f"{quantity:.3f}",
                        "available_quantity": f"{available:.3f}",
                        "shortage_quantity": f"{shortage:.3f}",
                        "message": "Product not available in inventory. Requirement will be sent to admin inventory dashboard.",
                    }
                )
                requirements_preview.append(
                    {
                        "product_id": product.id,
                        "required_quantity": f"{quantity:.3f}",
                        "available_quantity": f"{available:.3f}",
                        "shortage_quantity": f"{shortage:.3f}",
                        "source_module": "DIRECT_SALE",
                        "status": PurchaseNeedStatus.OPEN,
                    }
                )

            preview_lines.append(
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "sku": product.sku or product.product_code,
                    "quantity": f"{quantity:.3f}",
                    "unit_price": str(unit_price),
                    "discount_amount": str(discount_amount),
                    "tax_rate": str(tax_rate),
                    "line_total": str(line_total),
                    "requires_purchase": shortage > Decimal("0"),
                }
            )

        grand_total = grand_total.quantize(Decimal("0.01"))
        paid_amount = paid_amount.quantize(Decimal("0.01"))
        return Response(
            {
                "line_totals": preview_lines,
                "subtotal": str(subtotal.quantize(Decimal("0.01"))),
                "discount_total": str(discount_total.quantize(Decimal("0.01"))),
                "tax_total": str(tax_total.quantize(Decimal("0.01"))),
                "grand_total": str(grand_total),
                "stock_warnings": stock_warnings,
                "inventory_requirements_preview": requirements_preview,
                "payment_balance_preview": {
                    "paid_amount": str(paid_amount),
                    "balance_due": str((grand_total - paid_amount).quantize(Decimal("0.01"))),
                },
            }
        )


class AdminDirectSalePreviewView(_BaseDirectSalePreviewView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class CashierDirectSalePreviewView(_BaseDirectSalePreviewView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]


class AdminInventoryRequirementListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = PurchaseNeed.objects.select_related("product", "warehouse", "customer").order_by("-created_at", "-id")
        status_filter = (request.query_params.get("status") or "").strip().upper()
        source_module = (request.query_params.get("source_module") or "").strip().upper()
        product_id = request.query_params.get("product")
        priority = (request.query_params.get("priority") or "").strip().upper()
        date_from = (request.query_params.get("date_from") or "").strip()
        date_to = (request.query_params.get("date_to") or "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if source_module:
            queryset = queryset.filter(source_module=source_module)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if priority:
            queryset = queryset.filter(priority=priority)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        rows = []
        for need in queryset[:200]:
            sale = None
            if need.source_module == PurchaseNeed.SourceModule.DIRECT_SALE and str(need.source_object_id or "").isdigit():
                sale = (
                    DirectSale.objects.select_related("customer")
                    .prefetch_related("billing_invoices")
                    .filter(pk=int(need.source_object_id))
                    .first()
                )
            sale_state = get_direct_sale_operational_state(sale) if sale else None
            rows.append(
                {
                    "id": need.id,
                    "product_id": need.product_id,
                    "product_name": need.product.name,
                    "required_quantity": str(need.required_quantity),
                    "available_quantity": str(need.available_quantity),
                    "shortage_quantity": str(need.shortage_quantity),
                    "source_module": need.source_module,
                    "source_object_id": need.source_object_id,
                    "customer_id": need.customer_id,
                    "customer_name": getattr(getattr(need, "customer", None), "name", None),
                    "status": need.status,
                    "priority": need.priority,
                    "note": need.note,
                    "sale_id": sale.id if sale else None,
                    "sale_no": sale.sale_no if sale else None,
                    "invoice_id": sale_state["invoice_id"] if sale_state else None,
                    "invoice_number": sale_state["invoice_number"] if sale_state else None,
                    "operational_state": sale_state["operational_state"] if sale_state else None,
                    "next_actions": sale_state["next_actions"] if sale_state else [],
                    "created_at": need.created_at,
                }
            )
        return Response({"count": len(rows), "results": rows}, status=status.HTTP_200_OK)
