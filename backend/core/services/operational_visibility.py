from __future__ import annotations

from django.db.models import Q, QuerySet


INACTIVE_SUBSCRIPTION_STATUSES = {
    "CANCELLED",
    "TERMINATED",
    "REJECTED",
    "CLOSED",
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


def subscription_dashboard_visible_q(prefix: str = "") -> Q:
    return ~Q(**{f"{prefix}status__in": list(INACTIVE_SUBSCRIPTION_STATUSES)})


def subscription_collectible_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(COLLECTIBLE_SUBSCRIPTION_STATUSES)})


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


def filter_active_direct_sales(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(direct_sale_active_q(prefix))


def filter_active_invoices(queryset: QuerySet, *, prefix: str = "") -> QuerySet:
    return queryset.filter(invoice_active_q(prefix))
