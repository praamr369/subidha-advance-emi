from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from django.utils.crypto import get_random_string

from subscriptions.models import (
    AuditLog,
    DeliveryStatus,
    FulfillmentStatus,
    MONEY_ZERO,
    Subscription,
    SubscriptionDelivery,
    q2,
)
from subscriptions.services.audit_service import log_audit


ACTIVE_DELIVERY_STATUSES = tuple(SubscriptionDelivery.ACTIVE_STATUSES)
TERMINAL_DELIVERY_STATUSES = tuple(SubscriptionDelivery.TERMINAL_STATUSES)

ALLOWED_DELIVERY_TRANSITIONS: dict[str, set[str]] = {
    DeliveryStatus.PENDING: {
        DeliveryStatus.SCHEDULED,
        DeliveryStatus.CANCELLED,
    },
    DeliveryStatus.SCHEDULED: {
        DeliveryStatus.DISPATCHED,
        DeliveryStatus.FAILED,
        DeliveryStatus.CANCELLED,
    },
    DeliveryStatus.DISPATCHED: {
        DeliveryStatus.OUT_FOR_DELIVERY,
        DeliveryStatus.FAILED,
        DeliveryStatus.CANCELLED,
    },
    DeliveryStatus.OUT_FOR_DELIVERY: {
        DeliveryStatus.DELIVERED,
        DeliveryStatus.FAILED,
    },
    DeliveryStatus.DELIVERED: {
        DeliveryStatus.RETURN_REQUESTED,
    },
    DeliveryStatus.RETURN_REQUESTED: {
        DeliveryStatus.RETURNED,
    },
    DeliveryStatus.FAILED: set(),
    DeliveryStatus.CANCELLED: set(),
    DeliveryStatus.RETURNED: set(),
}


@dataclass(frozen=True)
class DeliverySummary:
    total: int
    pending: int
    scheduled: int
    in_transit: int
    delivered: int
    failed: int
    cancelled: int
    return_requested: int
    returned: int


def get_delivery_queryset():
    return SubscriptionDelivery.objects.select_related(
        "subscription",
        "subscription__customer",
        "subscription__product",
        "subscription__batch",
        "subscription__partner",
        "subscription__lucky_id",
        "created_by",
        "updated_by",
    ).order_by("-created_at", "-id")


def get_subscription_delivery_prefetch():
    return Prefetch(
        "deliveries",
        queryset=get_delivery_queryset(),
    )


def _money(value) -> str:
    return f"{q2(value or MONEY_ZERO):.2f}"


def _date(value):
    return value.isoformat() if value else None


def _datetime(value):
    return value.isoformat() if value else None


def _subscription_number(subscription: Subscription | None) -> str | None:
    if subscription is None or subscription.pk is None:
        return None
    return f"SUB-{subscription.pk}"


def _generate_delivery_reference() -> str:
    timestamp = timezone.now().strftime("%Y%m%d")
    return f"DLV-{timestamp}-{get_random_string(6).upper()}"


def _next_fulfillment_status(delivery: SubscriptionDelivery | None) -> str:
    if delivery is None:
        return FulfillmentStatus.PENDING

    if delivery.status == DeliveryStatus.DELIVERED:
        return FulfillmentStatus.DELIVERED
    if delivery.status == DeliveryStatus.RETURN_REQUESTED:
        return FulfillmentStatus.RETURN_REQUESTED
    if delivery.status == DeliveryStatus.RETURNED:
        return FulfillmentStatus.RETURNED
    return FulfillmentStatus.PENDING


def _get_prefetched_deliveries(subscription: Subscription) -> list[SubscriptionDelivery] | None:
    prefetched = getattr(subscription, "_prefetched_objects_cache", {})
    if "deliveries" not in prefetched:
        return None
    deliveries = prefetched["deliveries"]
    return list(deliveries) if isinstance(deliveries, Iterable) else None


def get_current_subscription_delivery(subscription: Subscription) -> SubscriptionDelivery | None:
    deliveries = _get_prefetched_deliveries(subscription)
    if deliveries is None:
        deliveries = list(
            get_delivery_queryset().filter(subscription=subscription)
        )

    active = [delivery for delivery in deliveries if delivery.status in ACTIVE_DELIVERY_STATUSES]
    if active:
        return sorted(active, key=lambda row: (row.created_at, row.id), reverse=True)[0]

    if not deliveries:
        return None

    return sorted(deliveries, key=lambda row: (row.created_at, row.id), reverse=True)[0]


def sync_subscription_fulfillment_status(subscription: Subscription) -> Subscription:
    prefetched = getattr(subscription, "_prefetched_objects_cache", None)
    if isinstance(prefetched, dict):
        prefetched.pop("deliveries", None)

    current_delivery = get_current_subscription_delivery(subscription)
    next_status = _next_fulfillment_status(current_delivery)

    if subscription.fulfillment_status != next_status:
        subscription.fulfillment_status = next_status
        subscription.save(update_fields=["fulfillment_status"])

    return subscription


def serialize_delivery_record(
    delivery: SubscriptionDelivery,
    *,
    include_subscription: bool = True,
) -> dict:
    subscription = delivery.subscription if include_subscription else None

    return {
        "id": delivery.id,
        "subscription": delivery.subscription_id,
        "subscription_id": delivery.subscription_id,
        "subscription_number": _subscription_number(subscription),
        "customer_id": getattr(subscription, "customer_id", None),
        "customer_name": getattr(getattr(subscription, "customer", None), "name", None),
        "customer_phone": getattr(getattr(subscription, "customer", None), "phone", None),
        "product_id": getattr(subscription, "product_id", None),
        "product_name": getattr(getattr(subscription, "product", None), "name", None),
        "product_code": getattr(getattr(subscription, "product", None), "product_code", None),
        "batch_id": getattr(subscription, "batch_id", None),
        "batch_code": getattr(getattr(subscription, "batch", None), "batch_code", None),
        "partner_id": getattr(subscription, "partner_id", None),
        "partner_username": getattr(getattr(subscription, "partner", None), "username", None),
        "lucky_id": getattr(subscription, "lucky_id_id", None),
        "lucky_number": getattr(getattr(subscription, "lucky_id", None), "lucky_number", None),
        "status": delivery.status,
        "delivery_reference": delivery.delivery_reference,
        "scheduled_date": _date(delivery.scheduled_date),
        "dispatched_at": _datetime(delivery.dispatched_at),
        "out_for_delivery_at": _datetime(delivery.out_for_delivery_at),
        "delivered_at": _datetime(delivery.delivered_at),
        "failed_at": _datetime(delivery.failed_at),
        "cancelled_at": _datetime(delivery.cancelled_at),
        "return_requested_at": _datetime(delivery.return_requested_at),
        "returned_at": _datetime(delivery.returned_at),
        "receiver_name": delivery.receiver_name,
        "receiver_phone": delivery.receiver_phone,
        "delivery_address_snapshot": delivery.delivery_address_snapshot,
        "notes": delivery.notes,
        "failure_reason": delivery.failure_reason,
        "created_by_id": delivery.created_by_id,
        "created_by_username": getattr(delivery.created_by, "username", None),
        "updated_by_id": delivery.updated_by_id,
        "updated_by_username": getattr(delivery.updated_by, "username", None),
        "created_at": _datetime(delivery.created_at),
        "updated_at": _datetime(delivery.updated_at),
        "is_terminal": delivery.is_terminal,
        "is_active_delivery": delivery.is_active_delivery,
        "fulfillment_status": getattr(subscription, "fulfillment_status", None),
    }


def build_subscription_delivery_summary(subscription: Subscription) -> dict | None:
    current = get_current_subscription_delivery(subscription)
    if current is None:
        return None

    payload = serialize_delivery_record(current)
    payload["history_count"] = (
        len(_get_prefetched_deliveries(subscription) or [])
        if _get_prefetched_deliveries(subscription) is not None
        else subscription.deliveries.count()
    )
    payload["delivery_status"] = current.status
    return payload


def build_subscription_delivery_history(subscription: Subscription) -> list[dict]:
    deliveries = _get_prefetched_deliveries(subscription)
    if deliveries is None:
        deliveries = list(get_delivery_queryset().filter(subscription=subscription))
    return [serialize_delivery_record(delivery) for delivery in deliveries]


def build_delivery_report_summary(queryset) -> dict:
    summary = queryset.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status=DeliveryStatus.PENDING)),
        scheduled=Count("id", filter=Q(status=DeliveryStatus.SCHEDULED)),
        dispatched=Count("id", filter=Q(status=DeliveryStatus.DISPATCHED)),
        out_for_delivery=Count("id", filter=Q(status=DeliveryStatus.OUT_FOR_DELIVERY)),
        delivered=Count("id", filter=Q(status=DeliveryStatus.DELIVERED)),
        failed=Count("id", filter=Q(status=DeliveryStatus.FAILED)),
        cancelled=Count("id", filter=Q(status=DeliveryStatus.CANCELLED)),
        return_requested=Count(
            "id",
            filter=Q(status=DeliveryStatus.RETURN_REQUESTED),
        ),
        returned=Count("id", filter=Q(status=DeliveryStatus.RETURNED)),
    )

    return {
        "total": summary["total"] or 0,
        "pending": summary["pending"] or 0,
        "scheduled": summary["scheduled"] or 0,
        "in_transit": (summary["dispatched"] or 0) + (summary["out_for_delivery"] or 0),
        "dispatched": summary["dispatched"] or 0,
        "out_for_delivery": summary["out_for_delivery"] or 0,
        "delivered": summary["delivered"] or 0,
        "failed": summary["failed"] or 0,
        "cancelled": summary["cancelled"] or 0,
        "return_requested": summary["return_requested"] or 0,
        "returned": summary["returned"] or 0,
    }


def _active_delivery_for_subscription(subscription: Subscription) -> SubscriptionDelivery | None:
    return (
        get_delivery_queryset()
        .filter(
            subscription=subscription,
            status__in=ACTIVE_DELIVERY_STATUSES,
        )
        .first()
    )


def _write_delivery_audit(
    *,
    action_type: str,
    delivery: SubscriptionDelivery,
    performed_by,
    metadata: dict | None = None,
):
    payload = {
        "delivery_id": delivery.id,
        "subscription_id": delivery.subscription_id,
        "delivery_reference": delivery.delivery_reference,
        "actor_id": getattr(performed_by, "id", None),
    }
    if metadata:
        payload.update(metadata)

    log_audit(
        action_type=action_type,
        instance=delivery,
        performed_by=performed_by,
        metadata=payload,
    )


@transaction.atomic
def create_subscription_delivery(
    *,
    subscription: Subscription,
    performed_by=None,
    status: str = DeliveryStatus.PENDING,
    delivery_reference: str | None = None,
    scheduled_date=None,
    receiver_name: str = "",
    receiver_phone: str = "",
    delivery_address_snapshot: str = "",
    notes: str = "",
):
    if _active_delivery_for_subscription(subscription) is not None:
        raise ValueError("An active delivery already exists for this subscription.")

    normalized_status = (status or DeliveryStatus.PENDING).strip().upper()
    if normalized_status not in {DeliveryStatus.PENDING, DeliveryStatus.SCHEDULED}:
        raise ValueError("New deliveries can start only in PENDING or SCHEDULED status.")

    delivery = SubscriptionDelivery.objects.create(
        subscription=subscription,
        status=normalized_status,
        delivery_reference=(delivery_reference or _generate_delivery_reference()),
        scheduled_date=scheduled_date,
        receiver_name=receiver_name or subscription.customer.name,
        receiver_phone=receiver_phone or subscription.customer.phone,
        delivery_address_snapshot=delivery_address_snapshot or subscription.customer.address,
        notes=notes or "",
        created_by=performed_by,
        updated_by=performed_by,
    )

    sync_subscription_fulfillment_status(subscription)

    _write_delivery_audit(
        action_type=AuditLog.ActionType.DELIVERY_CREATED,
        delivery=delivery,
        performed_by=performed_by,
        metadata={
            "status": delivery.status,
            "scheduled_date": _date(delivery.scheduled_date),
        },
    )

    return delivery


@transaction.atomic
def update_subscription_delivery_metadata(
    *,
    delivery: SubscriptionDelivery,
    performed_by=None,
    scheduled_date=None,
    receiver_name: str | None = None,
    receiver_phone: str | None = None,
    delivery_address_snapshot: str | None = None,
    notes: str | None = None,
    failure_reason: str | None = None,
):
    changed_fields: dict[str, str | None] = {}

    for field, value in {
        "scheduled_date": scheduled_date,
        "receiver_name": receiver_name,
        "receiver_phone": receiver_phone,
        "delivery_address_snapshot": delivery_address_snapshot,
        "notes": notes,
        "failure_reason": failure_reason,
    }.items():
        if value is None:
            continue

        current = getattr(delivery, field)
        next_value = value.strip() if isinstance(value, str) else value
        if current != next_value:
            setattr(delivery, field, next_value)
            changed_fields[field] = (
                next_value.isoformat() if hasattr(next_value, "isoformat") else str(next_value)
            )

    if not changed_fields:
        return delivery

    delivery.updated_by = performed_by
    delivery.save()

    _write_delivery_audit(
        action_type=AuditLog.ActionType.DELIVERY_UPDATED,
        delivery=delivery,
        performed_by=performed_by,
        metadata={"changed_fields": changed_fields},
    )

    return delivery


def _transition_action_type(next_status: str) -> str:
    mapping = {
        DeliveryStatus.DISPATCHED: AuditLog.ActionType.DELIVERY_DISPATCHED,
        DeliveryStatus.DELIVERED: AuditLog.ActionType.DELIVERY_COMPLETED,
        DeliveryStatus.FAILED: AuditLog.ActionType.DELIVERY_FAILED,
        DeliveryStatus.CANCELLED: AuditLog.ActionType.DELIVERY_CANCELLED,
        DeliveryStatus.RETURN_REQUESTED: AuditLog.ActionType.DELIVERY_RETURN_REQUESTED,
        DeliveryStatus.RETURNED: AuditLog.ActionType.DELIVERY_RETURNED,
    }
    return mapping.get(next_status, AuditLog.ActionType.DELIVERY_STATUS_CHANGED)


@transaction.atomic
def transition_subscription_delivery_status(
    *,
    delivery: SubscriptionDelivery,
    next_status: str,
    performed_by=None,
    scheduled_date=None,
    receiver_name: str | None = None,
    receiver_phone: str | None = None,
    notes: str | None = None,
    failure_reason: str | None = None,
):
    next_status = (next_status or "").strip().upper()
    if next_status not in DeliveryStatus.values:
        raise ValueError("Unsupported delivery status.")

    if next_status == delivery.status:
        return delivery

    allowed = ALLOWED_DELIVERY_TRANSITIONS.get(delivery.status, set())
    if next_status not in allowed:
        raise ValueError(
            f"Invalid delivery status transition from {delivery.status} to {next_status}."
        )

    if next_status in {DeliveryStatus.FAILED, DeliveryStatus.CANCELLED}:
        normalized_reason = (failure_reason or "").strip()
        if not normalized_reason:
            raise ValueError("A reason is required when failing or cancelling a delivery.")
        delivery.failure_reason = normalized_reason

    if next_status == DeliveryStatus.SCHEDULED and not (
        scheduled_date or delivery.scheduled_date
    ):
        raise ValueError("Scheduled date is required before moving a delivery to SCHEDULED.")

    if scheduled_date is not None:
        delivery.scheduled_date = scheduled_date
    if receiver_name is not None:
        delivery.receiver_name = receiver_name.strip()
    if receiver_phone is not None:
        delivery.receiver_phone = receiver_phone.strip()
    if notes is not None:
        delivery.notes = notes.strip()

    now = timezone.now()
    if next_status == DeliveryStatus.DISPATCHED:
        delivery.dispatched_at = delivery.dispatched_at or now
    elif next_status == DeliveryStatus.OUT_FOR_DELIVERY:
        delivery.out_for_delivery_at = delivery.out_for_delivery_at or now
    elif next_status == DeliveryStatus.DELIVERED:
        delivery.delivered_at = delivery.delivered_at or now
    elif next_status == DeliveryStatus.FAILED:
        delivery.failed_at = delivery.failed_at or now
    elif next_status == DeliveryStatus.CANCELLED:
        delivery.cancelled_at = delivery.cancelled_at or now
    elif next_status == DeliveryStatus.RETURN_REQUESTED:
        delivery.return_requested_at = delivery.return_requested_at or now
    elif next_status == DeliveryStatus.RETURNED:
        delivery.returned_at = delivery.returned_at or now

    previous_status = delivery.status
    delivery.status = next_status
    delivery.updated_by = performed_by
    delivery.save()

    sync_subscription_fulfillment_status(delivery.subscription)

    _write_delivery_audit(
        action_type=_transition_action_type(next_status),
        delivery=delivery,
        performed_by=performed_by,
        metadata={
            "old_status": previous_status,
            "new_status": next_status,
            "scheduled_date": _date(delivery.scheduled_date),
            "failure_reason": delivery.failure_reason or "",
            "notes": delivery.notes or "",
        },
    )

    if next_status in {DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED}:
        from inventory.services.delivery_bridge_service import sync_delivery_inventory_bridge

        sync_delivery_inventory_bridge(
            delivery=delivery,
            performed_by=performed_by,
        )

    try:
        from billing.services.billing_sync_service import sync_delivery_into_billing

        sync_delivery_into_billing(
            delivery=delivery,
            performed_by=performed_by,
        )
    except Exception:  # pragma: no cover - best-effort mirror sync
        pass

    return delivery


def mark_subscription_delivery_delivered(*, delivery, performed_by=None, receiver_name=None, receiver_phone=None, notes=None):
    return transition_subscription_delivery_status(
        delivery=delivery,
        next_status=DeliveryStatus.DELIVERED,
        performed_by=performed_by,
        receiver_name=receiver_name,
        receiver_phone=receiver_phone,
        notes=notes,
    )


def mark_subscription_delivery_failed(*, delivery, performed_by=None, failure_reason: str, notes=None):
    return transition_subscription_delivery_status(
        delivery=delivery,
        next_status=DeliveryStatus.FAILED,
        performed_by=performed_by,
        failure_reason=failure_reason,
        notes=notes,
    )


def cancel_subscription_delivery(*, delivery, performed_by=None, reason: str, notes=None):
    return transition_subscription_delivery_status(
        delivery=delivery,
        next_status=DeliveryStatus.CANCELLED,
        performed_by=performed_by,
        failure_reason=reason,
        notes=notes,
    )


def request_subscription_delivery_return(*, delivery, performed_by=None, notes=None):
    return transition_subscription_delivery_status(
        delivery=delivery,
        next_status=DeliveryStatus.RETURN_REQUESTED,
        performed_by=performed_by,
        notes=notes,
    )


def mark_subscription_delivery_returned(*, delivery, performed_by=None, notes=None):
    return transition_subscription_delivery_status(
        delivery=delivery,
        next_status=DeliveryStatus.RETURNED,
        performed_by=performed_by,
        notes=notes,
    )
