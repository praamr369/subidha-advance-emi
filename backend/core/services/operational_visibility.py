from __future__ import annotations

from django.db.models import Q, QuerySet


INACTIVE_SUBSCRIPTION_STATUSES = {
    "CANCELLED",
    "TERMINATED",
    "REJECTED",
    "CLOSED",
}

ACTIVE_BATCH_SUBSCRIPTION_STATUSES = {
    "ACTIVE",
    "APPROVED",
    "PAYMENT_PENDING",
    "DELIVERY_PENDING",
}

DRAW_ELIGIBLE_SUBSCRIPTION_STATUSES = {
    "ACTIVE",
}

COLLECTIBLE_SUBSCRIPTION_STATUSES = {
    "ACTIVE",
    "DEFAULTED",
    "PAYMENT_PENDING",
    "DELIVERY_PENDING",
}

INACTIVE_DIRECT_SALE_STATUSES = {
    "CANCELLED",
    "CANCELLED_PRE_INVOICE",
    "CANCELLED_AFTER_DELIVERY",
    "REVERSED_POST_INVOICE",
    "RETURNED",
    "EXCHANGED_CLOSED",
    "ARCHIVED",
}

INACTIVE_INVOICE_STATUSES = {
    "VOID",
    "CANCELLED",
    "REVERSED",
    "CREDITED_FULLY",
}

ACTIVE_RECEIPT_STATUSES = {
    "POSTED",
    "APPROVED",
}


def is_subscription_customer_active(subscription) -> bool:
    return getattr(subscription, "status", None) in ACTIVE_BATCH_SUBSCRIPTION_STATUSES


def is_subscription_active_receivable(subscription) -> bool:
    return getattr(subscription, "status", None) in COLLECTIBLE_SUBSCRIPTION_STATUSES


def is_subscription_history_only(subscription) -> bool:
    status = getattr(subscription, "status", None)
    return status not in ACTIVE_BATCH_SUBSCRIPTION_STATUSES


def is_direct_sale_customer_active(direct_sale) -> bool:
    return getattr(direct_sale, "status", None) not in INACTIVE_DIRECT_SALE_STATUSES


def is_direct_sale_active_receivable(direct_sale) -> bool:
    if not is_direct_sale_customer_active(direct_sale):
        return False
    return (getattr(direct_sale, "balance_total", 0) or 0) > 0


def is_direct_sale_history_only(direct_sale) -> bool:
    return not is_direct_sale_customer_active(direct_sale)


def is_invoice_customer_active_outstanding(invoice) -> bool:
    if getattr(invoice, "status", None) in INACTIVE_INVOICE_STATUSES:
        return False
    return (getattr(invoice, "balance_total", 0) or 0) > 0


def is_payment_active_collection(payment) -> bool:
    metadata = getattr(payment, "allocation_metadata", None) or {}
    reversal = metadata.get("reversal") or {}
    return not bool(reversal.get("is_reversed"))


def is_receipt_active_collection(receipt) -> bool:
    return getattr(receipt, "status", None) in ACTIVE_RECEIPT_STATUSES


def subscription_dashboard_visible_q(prefix: str = "") -> Q:
    return ~Q(**{f"{prefix}status__in": list(INACTIVE_SUBSCRIPTION_STATUSES)})


def subscription_collectible_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(COLLECTIBLE_SUBSCRIPTION_STATUSES)})


def subscription_batch_active_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(ACTIVE_BATCH_SUBSCRIPTION_STATUSES)})


def subscription_draw_eligible_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(DRAW_ELIGIBLE_SUBSCRIPTION_STATUSES)})


def direct_sale_active_q(prefix: str = "") -> Q:
    return ~Q(**{f"{prefix}status__in": list(INACTIVE_DIRECT_SALE_STATUSES)})


def invoice_active_q(prefix: str = "") -> Q:
    return ~Q(**{f"{prefix}status__in": list(INACTIVE_INVOICE_STATUSES)})


def receipt_active_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(ACTIVE_RECEIPT_STATUSES)})


def filter_dashboard_visible_subscriptions(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(subscription_dashboard_visible_q(prefix))


def filter_collectible_subscriptions(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(subscription_collectible_q(prefix))


def filter_batch_active_subscriptions(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(subscription_batch_active_q(prefix))


def filter_draw_eligible_subscriptions(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(subscription_draw_eligible_q(prefix))


def filter_active_direct_sales(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(direct_sale_active_q(prefix))


def filter_active_invoices(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(invoice_active_q(prefix))
