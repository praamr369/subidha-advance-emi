from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Q

from billing.models import DirectSale
from billing.services.direct_sale_delivery_bridge_service import get_direct_sale_delivery_case
from inventory.models import PurchaseNeed, PurchaseNeedStatus


def classify_direct_sale_stock_status(*, sale: DirectSale) -> tuple[str, list[dict[str, Any]], list[str]]:
    """
    Aggregate ATP classification across lines without mutating inventory.
    Returns (stock_status, per_line_summaries, warnings).
    """
    rank_labels = ("AVAILABLE", "INSUFFICIENT", "UNAVAILABLE", "NOT_CONFIGURED")
    worst = 0
    summaries: list[dict[str, Any]] = []
    warnings: list[str] = []

    lines = sale.lines.select_related("product", "inventory_item").order_by("id")
    if not lines.exists():
        return "NOT_CONFIGURED", [], ["Direct sale has no lines to evaluate for stock."]

    for line in lines:
        item = line.inventory_item
        req = Decimal(str(line.quantity or "0"))
        row: dict[str, Any] = {
            "line_id": line.id,
            "product_id": line.product_id,
            "required_quantity": f"{req:.3f}",
        }
        if item is None:
            row["stock_line_status"] = "NOT_CONFIGURED"
            worst = max(worst, 3)
        elif not item.stock_tracking_enabled:
            row["stock_line_status"] = "NOT_CONFIGURED"
            row["note"] = "Stock tracking disabled for inventory profile."
            worst = max(worst, 3)
        else:
            avail = item.available_qty()
            row["available_quantity"] = f"{avail:.3f}"
            if avail >= req:
                row["stock_line_status"] = "AVAILABLE"
                worst = max(worst, 0)
            elif avail > Decimal("0"):
                row["stock_line_status"] = "INSUFFICIENT"
                row["shortage_quantity"] = f"{(req - avail).quantize(Decimal('0.001')):.3f}"
                worst = max(worst, 1)
            else:
                row["stock_line_status"] = "UNAVAILABLE"
                row["shortage_quantity"] = f"{req:.3f}"
                worst = max(worst, 2)
        summaries.append(row)

    return rank_labels[worst], summaries, warnings


def list_direct_sale_stock_needs(*, sale: DirectSale) -> list[PurchaseNeed]:
    if sale.pk is None:
        return []
    keyed = Q(source_object_id__startswith=f"ds:{int(sale.id)}:p:")
    legacy = Q(source_object_id=str(int(sale.id)))
    return list(
        PurchaseNeed.objects.select_related("product", "warehouse", "customer", "branch")
        .filter(
            source_module=PurchaseNeed.SourceModule.DIRECT_SALE,
            status=PurchaseNeedStatus.OPEN,
        )
        .filter(keyed | legacy)
        .order_by("product_id", "id")
    )


def serialize_delivery_request(sale: DirectSale) -> dict[str, Any] | None:
    case = get_direct_sale_delivery_case(sale=sale)
    if case is None:
        return None
    return {
        "id": case.id,
        "status": case.status,
        "stock_status": case.stock_status,
        "finance_status": case.finance_status,
        "issue_summary": case.issue_summary,
        "direct_sale_id": sale.id,
    }


def serialize_stock_need_row(need: PurchaseNeed | None) -> dict[str, Any] | None:
    if need is None:
        return None
    return {
        "id": need.id,
        "need_no": need.need_no,
        "source_type": need.source_module,
        "source_object_id": need.source_object_id,
        "product": need.product_id,
        "product_name_snapshot": need.product_name_snapshot,
        "required_quantity": str(need.required_quantity),
        "available_quantity_snapshot": str(need.available_quantity),
        "shortage_quantity": str(need.shortage_quantity),
        "priority": need.priority,
        "status": need.status,
        "branch": need.branch_id,
        "customer": need.customer_id,
        "notes": need.note,
        "fulfilled_at": need.fulfilled_at.isoformat() if need.fulfilled_at else None,
    }


def build_direct_sale_workflow_payload(*, sale: DirectSale, sale_data: dict[str, Any]) -> dict[str, Any]:
    """Composite operational envelope around an existing DirectSale (caller supplies serialized sale row)."""
    stock_status, line_summaries, wf_warnings = classify_direct_sale_stock_status(sale=sale)
    needs = list_direct_sale_stock_needs(sale=sale)
    primary_need = needs[0] if needs else None
    summary_warnings = list(wf_warnings)
    if len(needs) > 1:
        summary_warnings.append(f"{len(needs)} distinct stock needs remain open for this sale.")

    return {
        "sale": sale_data,
        "stock_status": stock_status,
        "stock_lines": line_summaries,
        "delivery_request": serialize_delivery_request(sale),
        "stock_need": serialize_stock_need_row(primary_need),
        "stock_needs_open_count": len(needs),
        "warnings": summary_warnings,
    }
