from __future__ import annotations

from typing import Iterable, Optional

from django.db.models import QuerySet

from subscriptions.models import (
    Batch,
    BatchStatus,
    Customer,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    Subscription,
)


def get_customer_by_id(customer_id: int) -> Optional[Customer]:
    return Customer.objects.filter(pk=customer_id).first()


def get_product_by_id(product_id: int):
    # Imported lazily to avoid circular imports
    from subscriptions.models import Product

    return Product.objects.filter(pk=product_id).first()


def get_batch_by_id(batch_id: int) -> Optional[Batch]:
    return Batch.objects.filter(pk=batch_id).first()


def get_lucky_id_with_batch(lucky_id: int) -> Optional[LuckyId]:
    return LuckyId.objects.filter(pk=lucky_id).select_related("batch").first()


def is_batch_open(batch: Batch) -> bool:
    return batch.status == BatchStatus.OPEN


def is_lucky_id_available(lucky: LuckyId) -> bool:
    return lucky.status == LuckyIdStatus.AVAILABLE


def customer_emi_count_in_batch(*, customer: Customer, batch: Batch) -> int:
    """Number of EMI Lucky IDs a customer holds in a batch.

    A customer may hold multiple Lucky IDs in the same batch; this selector is
    informational (operator UI / analytics) and is intentionally NOT used to
    block subscription creation. Lucky ID uniqueness is enforced by DB
    constraints (one EMI subscription per Lucky ID, Lucky ID unique per batch).
    """
    return Subscription.objects.filter(
        batch=batch,
        customer=customer,
        plan_type=PlanType.EMI,
    ).count()


def customer_has_emi_in_batch(*, customer: Customer, batch: Batch) -> bool:
    """Backward-compatible informational alias for legacy selector callers.

    Subscription creation must not use this result as a uniqueness gate because
    one customer may hold multiple Lucky IDs in the same batch.
    """
    return customer_emi_count_in_batch(customer=customer, batch=batch) > 0


def get_latest_subscription_for_customer(customer: Customer) -> Optional[Subscription]:
    return (
        Subscription.objects.filter(customer=customer)
        .select_related("batch", "lucky_id")
        .order_by("-created_at")
        .first()
    )


def get_partner_subscriptions_for_user(user) -> QuerySet[Subscription]:
    return (
        Subscription.objects.select_related("customer", "product", "batch", "lucky_id")
        .filter(partner=user)
        .order_by("-created_at")
    )


def get_distinct_customer_ids_for_partner(user) -> Iterable[int]:
    return (
        Subscription.objects.filter(partner=user)
        .values_list("customer_id", flat=True)
        .distinct()
    )
