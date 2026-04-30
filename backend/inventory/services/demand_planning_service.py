from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum

from inventory.models import (
    InventoryItem,
    PurchaseBillStatus,
    PurchaseNeed,
    StockLedger,
    StockMovementType,
    Warehouse,
)
from subscriptions.models import DeliveryStatus, Subscription, SubscriptionStatus


QUANTITY_ZERO = Decimal("0.000")


def _qty(value) -> Decimal:
    return Decimal(str(value or QUANTITY_ZERO)).quantize(Decimal("0.001"))


def _first_warehouse() -> Warehouse | None:
    return Warehouse.objects.filter(is_active=True).order_by("id").first()


def calculate_product_demand(*, product_id: int) -> dict:
    active_subscriptions = Subscription.objects.filter(
        product_id=product_id,
        status__in=[
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.DELIVERY_PENDING,
            SubscriptionStatus.HANDED_OVER,
        ],
    ).count()

    locked_batch_demand = Subscription.objects.filter(
        product_id=product_id,
        batch__status="LOCKED",
    ).count()

    winners_pending_delivery = Subscription.objects.filter(
        product_id=product_id,
        status=SubscriptionStatus.WON,
        deliveries__status__in=[
            DeliveryStatus.PENDING,
            DeliveryStatus.SCHEDULED,
            DeliveryStatus.DISPATCHED,
            DeliveryStatus.OUT_FOR_DELIVERY,
            DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE,
        ],
    ).distinct().count()

    direct_sale_orders = 0
    try:
        from billing.models import DirectSale, DirectSaleStatus

        direct_sale_orders = DirectSale.objects.filter(
            lines__product_id=product_id,
            status__in=[DirectSaleStatus.CONFIRMED, DirectSaleStatus.DELIVERED],
        ).distinct().count()
    except Exception:
        direct_sale_orders = 0

    rent_lease_commitments = Subscription.objects.filter(
        product_id=product_id,
        plan_type__in=["RENT", "LEASE"],
        status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.DELIVERY_PENDING],
    ).count()

    total_required = _qty(
        active_subscriptions
        + locked_batch_demand
        + winners_pending_delivery
        + direct_sale_orders
        + rent_lease_commitments
    )

    return {
        "product_id": product_id,
        "active_subscriptions": active_subscriptions,
        "locked_batch_demand": locked_batch_demand,
        "winners_pending_delivery": winners_pending_delivery,
        "direct_sale_orders": direct_sale_orders,
        "rent_lease_commitments": rent_lease_commitments,
        "total_required": f"{total_required:.3f}",
    }


def get_product_stock_availability(*, product_id: int) -> dict:
    item = InventoryItem.objects.select_related("product").filter(product_id=product_id).first()
    on_hand = item.current_stock_quantity() if item else QUANTITY_ZERO
    reserved = item.reserved_qty() if item else QUANTITY_ZERO
    available = max(QUANTITY_ZERO, on_hand - reserved)

    incoming = _qty(
        StockLedger.objects.filter(
            inventory_item__product_id=product_id,
            movement_type__in=[StockMovementType.PURCHASE_IN, StockMovementType.TRANSFER_IN],
        ).aggregate(total=Sum("quantity_in"))["total"]
    )
    additional_incoming = Decimal("0.000")
    try:
        from inventory.models import PurchaseBillLine

        additional_incoming = _qty(
            PurchaseBillLine.objects.filter(
                inventory_item__product_id=product_id,
                purchase_bill__status__in=[PurchaseBillStatus.DRAFT, PurchaseBillStatus.APPROVED],
            ).aggregate(total=Sum("quantity"))["total"]
        )
    except Exception:
        additional_incoming = Decimal("0.000")
    incoming = incoming + additional_incoming

    demand = calculate_product_demand(product_id=product_id)
    return {
        "product_id": product_id,
        "on_hand": f"{on_hand:.3f}",
        "reserved": f"{reserved:.3f}",
        "available": f"{available:.3f}",
        "incoming": f"{incoming:.3f}",
        "required_for_winners": str(demand["winners_pending_delivery"]),
        "required_for_confirmed_orders": str(
            int(demand["direct_sale_orders"]) + int(demand["rent_lease_commitments"])
        ),
        "demand": demand,
    }


def upsert_purchase_need_for_product(*, product_id: int, created_by=None) -> PurchaseNeed | None:
    warehouse = _first_warehouse()
    if warehouse is None:
        return None

    availability = get_product_stock_availability(product_id=product_id)
    required = _qty(availability["demand"]["total_required"])
    available_qty = _qty(availability["available"])
    shortage = max(QUANTITY_ZERO, required - available_qty)
    if shortage <= QUANTITY_ZERO:
        return None

    need, _created = PurchaseNeed.objects.update_or_create(
        product_id=product_id,
        warehouse=warehouse,
        status="OPEN",
        defaults={
            "required_quantity": required,
            "available_quantity": available_qty,
            "shortage_quantity": shortage,
            "demand_snapshot": availability["demand"],
            "created_by": created_by if getattr(created_by, "pk", None) else None,
            "note": "Auto-generated from inventory demand planning.",
        },
    )
    return need


def stock_status_for_delivery(*, product_id: int) -> dict:
    availability = get_product_stock_availability(product_id=product_id)
    available = _qty(availability["available"])
    reserved = _qty(availability["reserved"])
    required = _qty(availability["demand"]["total_required"])

    if available > QUANTITY_ZERO:
        status = "available"
    elif reserved > QUANTITY_ZERO:
        status = "reserved"
    elif required > QUANTITY_ZERO:
        status = "purchase needed"
    else:
        status = "not available"

    return {
        "status": status,
        "on_hand": availability["on_hand"],
        "reserved": availability["reserved"],
        "available": availability["available"],
    }
