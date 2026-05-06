"""
Reconcile PurchaseNeed rows against current ATP (available-to-promise) quantities.

Read-only with respect to stock ledgers: only updates PurchaseNeed snapshots and status.
"""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from inventory.models import InventoryItem, PurchaseNeed, PurchaseNeedStatus
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

QUANTITY_ZERO = Decimal("0.000")


def parse_direct_sale_id_from_need_source(source_object_id: str | None) -> int | None:
    token = (source_object_id or "").strip()
    if token.isdigit():
        return int(token)
    if token.startswith("ds:") and ":p:" in token:
        try:
            return int(token.split(":")[1])
        except (ValueError, IndexError):
            return None
    return None


def _qty(value) -> Decimal:
    return Decimal(str(value or QUANTITY_ZERO)).quantize(Decimal("0.001"))


def available_quantity_for_product(*, product_id: int) -> Decimal:
    item = InventoryItem.objects.filter(product_id=product_id).first()
    if item is None:
        return QUANTITY_ZERO
    return _qty(item.available_qty())


def direct_sale_need_q(sale_id: int) -> Q:
    return Q(source_module=PurchaseNeed.SourceModule.DIRECT_SALE) & (
        Q(source_object_id=str(int(sale_id))) | Q(source_object_id__startswith=f"ds:{int(sale_id)}:p:")
    )


@transaction.atomic
def recheck_purchase_need_availability(*, need_id: int, actor=None) -> dict:
    need = (
        PurchaseNeed.objects.select_for_update(of=("self",))
        .select_related("product", "warehouse")
        .filter(pk=need_id)
        .first()
    )
    if need is None:
        return {
            "updated": False,
            "outcome": "NOT_FOUND",
            "message": "Stock need not found.",
        }

    if need.status in {
        PurchaseNeedStatus.FULFILLED,
        PurchaseNeedStatus.CANCELLED,
        PurchaseNeedStatus.CLOSED,
    }:
        return {
            "updated": False,
            "outcome": "NO_CHANGE",
            "status": need.status,
            "purchase_need_id": need.id,
            "need_no": need.need_no,
            "message": "Need is already closed or fulfilled.",
        }

    if need.status not in {
        PurchaseNeedStatus.OPEN,
        PurchaseNeedStatus.IN_REVIEW,
        PurchaseNeedStatus.ORDERED,
        PurchaseNeedStatus.PARTIALLY_FULFILLED,
    }:
        return {
            "updated": False,
            "outcome": "SKIP_STATUS",
            "status": need.status,
            "purchase_need_id": need.id,
            "need_no": need.need_no,
            "message": "Recheck only updates operational purchase-need rows.",
        }

    available = available_quantity_for_product(product_id=need.product_id)
    required = _qty(need.required_quantity)
    shortage = max(QUANTITY_ZERO, required - available)

    need.available_quantity = available
    need.shortage_quantity = shortage
    need.demand_snapshot = {
        **(need.demand_snapshot or {}),
        "recheck_at": timezone.now().isoformat(),
        "available_quantity": f"{available:.3f}",
        "required_quantity": f"{required:.3f}",
        "shortage_quantity": f"{shortage:.3f}",
    }
    update_fields = ["available_quantity", "shortage_quantity", "demand_snapshot", "updated_at"]

    outcome = "STILL_SHORT"
    allow_auto_fulfill = need.status in {PurchaseNeedStatus.OPEN, PurchaseNeedStatus.IN_REVIEW}

    if allow_auto_fulfill and shortage <= QUANTITY_ZERO:
        need.status = PurchaseNeedStatus.FULFILLED
        need.fulfilled_at = timezone.now()
        update_fields.extend(["status", "fulfilled_at"])
        outcome = "RESOLVED_BY_AVAILABLE_STOCK"
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=need,
            performed_by=actor,
            metadata={
                "event": "STOCK_REQUIREMENT_RESOLVED_BY_AVAILABLE_STOCK",
                "purchase_need_id": need.id,
                "need_no": need.need_no,
                "product_id": need.product_id,
                "required_quantity": str(required),
                "available_quantity": str(available),
            },
        )
    elif not allow_auto_fulfill:
        outcome = "SNAPSHOT_ONLY"

    need.save(update_fields=update_fields)

    return {
        "updated": True,
        "outcome": outcome,
        "purchase_need_id": need.id,
        "need_no": need.need_no,
        "status": need.status,
        "required_quantity": str(required),
        "available_quantity": str(available),
        "shortage_quantity": str(shortage),
        "message": (
            "Requirement covered by current available stock."
            if outcome == "RESOLVED_BY_AVAILABLE_STOCK"
            else (
                "Availability snapshot updated (purchase workflow may still be active)."
                if outcome == "SNAPSHOT_ONLY"
                else "Stock still short for this requirement."
            )
        ),
    }


@transaction.atomic
def reconcile_direct_sale_stock_requirements(*, direct_sale_id: int, actor=None) -> dict:
    need_ids = list(PurchaseNeed.objects.filter(direct_sale_need_q(direct_sale_id)).values_list("id", flat=True))
    results = [recheck_purchase_need_availability(need_id=nid, actor=actor) for nid in need_ids]
    return {"direct_sale_id": direct_sale_id, "count": len(results), "results": results}


def reconcile_open_direct_sale_needs_for_product(*, product_id: int, actor=None) -> dict:
    """Called after inventory-in events to refresh needs tied to direct sales for this SKU."""
    need_rows = list(
        PurchaseNeed.objects.filter(
            product_id=product_id,
            source_module=PurchaseNeed.SourceModule.DIRECT_SALE,
            status__in=[
                PurchaseNeedStatus.OPEN,
                PurchaseNeedStatus.IN_REVIEW,
                PurchaseNeedStatus.ORDERED,
                PurchaseNeedStatus.PARTIALLY_FULFILLED,
            ],
        ).values("id", "source_object_id")
    )
    sale_ids: set[int] = set()
    for row in need_rows:
        sid = parse_direct_sale_id_from_need_source(row.get("source_object_id"))
        if sid is not None:
            sale_ids.add(sid)
    results = [recheck_purchase_need_availability(need_id=row["id"], actor=actor) for row in need_rows]
    if sale_ids:
        try:
            from billing.models import DirectSale
            from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

            for sid in sale_ids:
                sale = DirectSale.objects.filter(pk=sid).first()
                if sale is not None:
                    sync_direct_sale_delivery_case(sale=sale, actor=actor)
        except Exception:
            pass
    return {"product_id": product_id, "count": len(results), "results": results}


def reconcile_direct_sale_needs_after_inventory_in(*, product_ids: Iterable[int], actor=None) -> None:
    seen: set[int] = set()
    for raw in product_ids:
        try:
            pid = int(raw)
        except (TypeError, ValueError):
            continue
        if pid <= 0 or pid in seen:
            continue
        seen.add(pid)
        reconcile_open_direct_sale_needs_for_product(product_id=pid, actor=actor)
