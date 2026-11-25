from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum, DecimalField, F, Case, When, Value
from django.db.models.functions import Coalesce

from inventory.models import InventoryItem, InventoryValuation, InventoryValuationMethod, StockLedger


def _decimal(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def weighted_average_unit_cost(item: InventoryItem, *, as_of_date: date | None = None) -> Decimal:
    """Company valuation policy: Weighted Average Cost over persisted purchase
    bill lines (optionally only bills dated on/before ``as_of_date`` so a
    historical stock-out values deterministically), falling back to the item's
    standard unit cost when no purchase history exists."""
    total_cost = Decimal("0.00")
    total_quantity = Decimal("0.000")
    
    # 1. Purchase Bill Lines
    lines = item.purchase_bill_lines.all()
    if as_of_date is not None:
        lines = lines.select_related("purchase_bill").filter(purchase_bill__bill_date__lte=as_of_date)
    for line in lines:
        quantity = Decimal(str(line.quantity or "0.000"))
        total_quantity += quantity
        total_cost += quantity * Decimal(str(line.unit_cost or "0.00"))

    # 2. Opening Stock Entries
    opening_entries = item.opening_stock_entries.filter(status="POSTED")
    if as_of_date is not None:
        opening_entries = opening_entries.filter(effective_date__lte=as_of_date)
    for entry in opening_entries:
        quantity = Decimal(str(entry.quantity or "0.000"))
        total_quantity += quantity
        total_cost += quantity * Decimal(str(entry.unit_cost_snapshot or "0.00"))

    if total_quantity <= 0:
        return _decimal(item.standard_unit_cost)
    return (total_cost / total_quantity).quantize(Decimal("0.01"))


def _latest_weighted_cost(item: InventoryItem) -> Decimal:
    return weighted_average_unit_cost(item)


def _calculate_on_hand_qty_bulk(item: InventoryItem, stock_location_id: int | None = None) -> Decimal:
    """On-hand quantity for a single item, matching the canonical stock formula.

    Canonical (see inventory.services.stock_service): on-hand =
    opening_stock_qty + Sum(quantity_in) - Sum(quantity_out), aggregated over
    StockLedger while EXCLUDING soft-hold movements (reservations etc.). Omitting
    either piece understated inventory valuation for opening-balance-only items.
    """
    from django.db.models import Q as DjangoQ
    from inventory.models import SOFT_HOLD_MOVEMENT_TYPES

    ledger_filter = DjangoQ(inventory_item_id=item.id)
    if stock_location_id:
        ledger_filter &= DjangoQ(stock_location_id=stock_location_id)

    result = (
        StockLedger.objects.filter(ledger_filter)
        .exclude(movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES))
        .aggregate(
            total_in=Sum('quantity_in', output_field=DecimalField()),
            total_out=Sum('quantity_out', output_field=DecimalField()),
        )
    )

    total_in = result['total_in'] or Decimal("0.000")
    total_out = result['total_out'] or Decimal("0.000")
    opening = Decimal(str(item.opening_stock_qty or "0.000"))
    return total_in - total_out + opening


def build_inventory_valuation(
    *,
    as_of_date: date | None = None,
    search: str | None = None,
    category: str | None = None,
    exclude_zero: bool = False,
    stock_location_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
):
    if isinstance(as_of_date, str):
        effective_date = date.fromisoformat(as_of_date)
    else:
        effective_date = as_of_date or date.today()

    rows = []
    total_value = Decimal("0.00")
    total_count = 0

    queryset = (
        InventoryItem.objects.select_related("product")
        .filter(is_active=True)
    )

    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) | Q(sku__icontains=search) | Q(product__product_code__icontains=search)
        )
    if category:
        queryset = queryset.filter(product__category__iexact=category)

    queryset = queryset.order_by("product__name", "id")

    # First pass: calculate totals across all filtered items
    all_items = list(queryset)
    temp_rows = []

    for item in all_items:
        on_hand = _calculate_on_hand_qty_bulk(item, stock_location_id)
        if exclude_zero and on_hand <= Decimal("0.000"):
            continue
        unit_cost = _latest_weighted_cost(item)
        stock_value = (Decimal(str(on_hand)) * unit_cost).quantize(Decimal("0.01"))
        total_value += stock_value

        temp_rows.append({
            "inventory_item_id": item.id,
            "product_code": item.product.product_code,
            "product_name": item.product.name,
            "sku": item.sku,
            "valuation_method": item.valuation_method,
            "as_of_date": effective_date.isoformat(),
            "on_hand_qty": f"{on_hand:.3f}",
            "unit_cost": f"{unit_cost:.2f}",
            "stock_value": f"{stock_value:.2f}",
        })

    total_count = len(temp_rows)

    # Apply pagination to temp_rows
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    rows = temp_rows[start_idx:end_idx]

    num_pages = (total_count + page_size - 1) // page_size

    return {
        "as_of_date": effective_date.isoformat(),
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
        "total_value": f"{total_value:.2f}",
        "rows": rows,
    }


def build_inventory_valuation_csv(
    *,
    as_of_date: date | None = None,
    search: str | None = None,
    category: str | None = None,
    exclude_zero: bool = False,
    stock_location_id: int | None = None,
) -> str:
    """Generate CSV export of the complete filtered inventory valuation."""
    if isinstance(as_of_date, str):
        effective_date = date.fromisoformat(as_of_date)
    else:
        effective_date = as_of_date or date.today()

    rows = []
    total_value = Decimal("0.00")

    queryset = (
        InventoryItem.objects.select_related("product")
        .filter(is_active=True)
    )

    if search:
        queryset = queryset.filter(
            Q(product__name__icontains=search) | Q(sku__icontains=search) | Q(product__product_code__icontains=search)
        )
    if category:
        queryset = queryset.filter(product__category__iexact=category)

    queryset = queryset.order_by("product__name", "id")

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)

    # Write header
    writer.writerow([
        "Product Code",
        "Product Name",
        "SKU",
        "Valuation Method",
        "On Hand Qty",
        "Unit Cost",
        "Stock Value",
    ])

    # Write data rows
    for item in queryset:
        on_hand = _calculate_on_hand_qty_bulk(item, stock_location_id)
        if exclude_zero and on_hand <= Decimal("0.000"):
            continue
        unit_cost = _latest_weighted_cost(item)
        stock_value = (Decimal(str(on_hand)) * unit_cost).quantize(Decimal("0.01"))
        total_value += stock_value

        writer.writerow([
            item.product.product_code,
            item.product.name,
            item.sku or "",
            item.valuation_method,
            f"{on_hand:.3f}",
            f"{unit_cost:.2f}",
            f"{stock_value:.2f}",
        ])

    # Write summary row
    writer.writerow([])
    writer.writerow(["Total Stock Value", f"{total_value:.2f}"])
    writer.writerow(["As Of Date", effective_date.isoformat()])

    return csv_buffer.getvalue()


@transaction.atomic
def create_inventory_valuation_snapshot(*, as_of_date: date | None = None, created_by=None):
    payload = build_inventory_valuation(as_of_date=as_of_date)
    snapshot = InventoryValuation.objects.create(
        as_of_date=date.fromisoformat(payload["as_of_date"]),
        # The builder above values stock at weighted average cost, so record AVG
        # (the previous hardcoded "FIFO" label misstated the method actually used).
        method=InventoryValuationMethod.AVG,
        totals_json=payload,
        created_by=created_by,
    )
    return snapshot


def _resolve_inventory_unit_cost(inv) -> Decimal:
    """Resolve effective per-unit cost for an InventoryItem:
    manufacturing rollup (if enabled & >0) > purchase_unit_cost > standard_unit_cost."""
    if not inv:
        return Decimal("0.00")
    if getattr(inv, "manufacturing_cost_enabled", False):
        mfg_cost = (
            Decimal(str(getattr(inv, "manufacturing_raw_material_cost", None) or "0"))
            + Decimal(str(getattr(inv, "manufacturing_labour_cost", None) or "0"))
            + Decimal(str(getattr(inv, "manufacturing_overhead_cost", None) or "0"))
        )
        if mfg_cost > Decimal("0.00"):
            return mfg_cost.quantize(Decimal("0.01"))
    p_cost = Decimal(str(getattr(inv, "purchase_unit_cost", None) or "0"))
    if p_cost > Decimal("0.00"):
        return p_cost.quantize(Decimal("0.01"))
    s_cost = Decimal(str(getattr(inv, "standard_unit_cost", None) or "0"))
    if s_cost > Decimal("0.00"):
        return s_cost.quantize(Decimal("0.01"))
    return Decimal("0.00")


def compute_product_costing_summary(
    *,
    inventory_item=None,
    product=None,
    variant=None,
    pim_product=None,
) -> dict:
    """Compute product cost, attached accessories cost, total cost, selling price,
    net profit, and profit margin % of selling price for a SKU/product."""
    from products_core.models import ProductRelationship
    from products_pim.models import PimProduct as PimProdModel, ProductVariant as PimVariantModel

    inv = inventory_item
    op_prod = product
    var_obj = variant
    pim_obj = pim_product

    # Cross-resolve references cleanly without assuming all kwargs were passed
    if pim_obj is not None and op_prod is None and getattr(pim_obj, "source_product_id", None):
        op_prod = pim_obj.source_product
    if var_obj is not None and op_prod is None and getattr(var_obj, "operational_product_id", None):
        op_prod = var_obj.operational_product
    if inv is not None and op_prod is None and getattr(inv, "product_id", None):
        op_prod = inv.product
    if op_prod is not None and inv is None:
        inv = getattr(op_prod, "inventory_profile", None)
    if op_prod is not None and var_obj is None:
        var_obj = getattr(op_prod, "pim_variant", None)
    if pim_obj is not None and pim_obj.parent_id and var_obj is None:
        var_obj = PimVariantModel.objects.filter(sku=pim_obj.code).select_related(
            "product__source_product", "operational_product__inventory_profile"
        ).first()
    if op_prod is not None and pim_obj is None:
        pim_obj = op_prod.pim.first()

    # 1. Base / Product unit cost
    base_cost = _resolve_inventory_unit_cost(inv)
    if base_cost <= Decimal("0.00") and var_obj is not None and var_obj.cost_price is not None:
        base_cost = Decimal(str(var_obj.cost_price)).quantize(Decimal("0.01"))
    if base_cost <= Decimal("0.00") and pim_obj is not None and pim_obj.cost_price is not None:
        base_cost = Decimal(str(pim_obj.cost_price)).quantize(Decimal("0.01"))
    if base_cost <= Decimal("0.00") and op_prod is not None and getattr(op_prod, "cost_price", None) is not None:
        base_cost = Decimal(str(op_prod.cost_price)).quantize(Decimal("0.01"))

    # 2. Selling price
    selling_price = Decimal("0.00")
    if var_obj is not None and getattr(var_obj, "price", None) is not None and Decimal(str(var_obj.price)) > Decimal("0.00"):
        selling_price = Decimal(str(var_obj.price)).quantize(Decimal("0.01"))
    elif op_prod is not None and getattr(op_prod, "base_price", None) is not None and Decimal(str(op_prod.base_price)) > Decimal("0.00"):
        selling_price = Decimal(str(op_prod.base_price)).quantize(Decimal("0.01"))
    elif pim_obj is not None and getattr(pim_obj, "base_price", None) is not None and Decimal(str(pim_obj.base_price)) > Decimal("0.00"):
        selling_price = Decimal(str(pim_obj.base_price)).quantize(Decimal("0.01"))

    # 3. Attached accessories & BOM relationships scoped to this SKU / product
    parent_op = None
    if var_obj is not None and getattr(var_obj, "product_id", None) and var_obj.product.source_product_id:
        parent_op = var_obj.product.source_product
    elif pim_obj is not None and pim_obj.parent_id and pim_obj.parent and pim_obj.parent.source_product_id:
        parent_op = pim_obj.parent.source_product
    else:
        parent_op = op_prod

    rels = []
    if parent_op is not None:
        rel_qs = ProductRelationship.objects.filter(product=parent_op).select_related(
            "related_product__inventory_profile",
            "related_variant__product__inventory_profile",
        )
        if var_obj is not None:
            rel_qs = rel_qs.filter(
                Q(parent_variant_sku=var_obj.sku)
                | Q(parent_variant__sku=var_obj.sku)
                | (Q(parent_variant__isnull=True) & (Q(parent_variant_sku__isnull=True) | Q(parent_variant_sku="")))
            )
        else:
            rel_qs = rel_qs.filter(
                Q(parent_variant__isnull=True) & (Q(parent_variant_sku__isnull=True) | Q(parent_variant_sku=""))
            )
        rels = list(rel_qs)

    included_acc_cost = Decimal("0.00")
    addons_cost = Decimal("0.00")
    addons_selling_price = Decimal("0.00")
    breakdown = []

    for rel in rels:
        rel_qty = Decimal(str(rel.quantity or "1"))
        rel_unit_cost = Decimal("0.00")
        rel_var_sku = (
            getattr(rel, "related_variant_sku", None)
            or (rel.related_variant.sku if rel.related_variant_id and rel.related_variant else None)
            or ""
        ).strip()
        rel_pim_var = None
        if rel_var_sku:
            var_inv = InventoryItem.objects.filter(sku=rel_var_sku).first()
            if var_inv:
                rel_unit_cost = _resolve_inventory_unit_cost(var_inv)
            rel_pim_var = PimVariantModel.objects.filter(sku=rel_var_sku).select_related(
                "operational_product__inventory_profile"
            ).first()
            if rel_unit_cost <= Decimal("0.00") and rel_pim_var:
                if rel_pim_var.operational_product_id:
                    rel_unit_cost = _resolve_inventory_unit_cost(
                        getattr(rel_pim_var.operational_product, "inventory_profile", None)
                    )
                if rel_unit_cost <= Decimal("0.00") and rel_pim_var.cost_price is not None:
                    rel_unit_cost = Decimal(str(rel_pim_var.cost_price)).quantize(Decimal("0.01"))
        if rel_unit_cost <= Decimal("0.00") and rel.related_product_id:
            rel_inv = getattr(rel.related_product, "inventory_profile", None)
            rel_unit_cost = _resolve_inventory_unit_cost(rel_inv)
            if rel_unit_cost <= Decimal("0.00"):
                rel_pim = PimProdModel.objects.filter(source_product_id=rel.related_product_id).first()
                if rel_pim and rel_pim.cost_price is not None:
                    rel_unit_cost = Decimal(str(rel_pim.cost_price)).quantize(Decimal("0.01"))

        line_cost = (rel_unit_cost * rel_qty).quantize(Decimal("0.01"))
        charge_mode = getattr(rel, "charge_mode", None) or (
            "FREE" if getattr(rel, "is_price_included_in_parent", False) else "CHARGEABLE"
        )
        is_included = charge_mode == "FREE" or bool(getattr(rel, "is_price_included_in_parent", False))
        addon_unit_sale = Decimal(
            str(
                getattr(rel, "sale_price", None)
                or (rel_pim_var.price if rel_pim_var else None)
                or (rel.related_variant.effective_price if rel.related_variant_id and rel.related_variant else None)
                or (rel.related_product.base_price if rel.related_product_id else None)
                or "0"
            )
        ).quantize(Decimal("0.01"))
        addon_line_sale = (addon_unit_sale * rel_qty).quantize(Decimal("0.01"))

        if is_included:
            included_acc_cost += line_cost
        else:
            addons_cost += line_cost
            addons_selling_price += addon_line_sale

        rel_name = (
            (rel.related_variant.variant_name or rel.related_variant.sku)
            if rel.related_variant_id and rel.related_variant and (rel.related_variant.variant_name or rel.related_variant.sku)
            else (rel.related_product.name if rel.related_product_id else "Attachment")
        )
        rel_code = (
            rel.related_variant.sku
            if rel.related_variant_id and rel.related_variant
            else (rel.related_product.product_code if rel.related_product_id else "")
        )
        breakdown.append({
            "id": rel.id,
            "name": rel_name,
            "code": rel_code,
            "relationship_type": rel.relationship_type,
            "qty": f"{rel_qty:.2f}",
            "unit_cost": f"{rel_unit_cost:.2f}",
            "total_cost": f"{line_cost:.2f}",
            "charge_mode": "FREE" if is_included else "CHARGEABLE",
            "sale_price": f"{addon_line_sale:.2f}" if not is_included else "0.00",
            "sourcing_type": getattr(rel, "sourcing_type", "SUPPLIED_WITH_PARENT") or "SUPPLIED_WITH_PARENT",
        })

    included_acc_cost = included_acc_cost.quantize(Decimal("0.01"))
    addons_cost = addons_cost.quantize(Decimal("0.01"))
    addons_selling_price = addons_selling_price.quantize(Decimal("0.01"))
    all_acc_cost = (included_acc_cost + addons_cost).quantize(Decimal("0.01"))

    total_cost = (base_cost + included_acc_cost).quantize(Decimal("0.01"))
    net_profit = (selling_price - total_cost).quantize(Decimal("0.01"))
    margin_pct = (
        ((net_profit / selling_price) * Decimal("100")).quantize(Decimal("0.01"))
        if selling_price > Decimal("0.00")
        else Decimal("0.00")
    )

    with_addons_total_cost = (total_cost + addons_cost).quantize(Decimal("0.01"))
    with_addons_selling = (selling_price + addons_selling_price).quantize(Decimal("0.01"))
    with_addons_net = (with_addons_selling - with_addons_total_cost).quantize(Decimal("0.01"))
    with_addons_margin_pct = (
        ((with_addons_net / with_addons_selling) * Decimal("100")).quantize(Decimal("0.01"))
        if with_addons_selling > Decimal("0.00")
        else Decimal("0.00")
    )

    return {
        "product_cost": f"{base_cost:.2f}",
        "accessories_cost": f"{included_acc_cost:.2f}",
        "addons_cost": f"{addons_cost:.2f}",
        "addons_selling_price": f"{addons_selling_price:.2f}",
        "all_accessories_cost": f"{all_acc_cost:.2f}",
        "total_cost": f"{total_cost:.2f}",
        "selling_price": f"{selling_price:.2f}",
        "net_profit": f"{net_profit:.2f}",
        "profit_margin_percent": f"{margin_pct:.2f}",
        "with_addons_total_cost": f"{with_addons_total_cost:.2f}",
        "with_addons_selling_price": f"{with_addons_selling:.2f}",
        "with_addons_net_profit": f"{with_addons_net:.2f}",
        "with_addons_margin_percent": f"{with_addons_margin_pct:.2f}",
        "accessories_count": len(breakdown),
        "accessories_breakdown": breakdown,
    }
