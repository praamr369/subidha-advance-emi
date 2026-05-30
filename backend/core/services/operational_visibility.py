from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Q, QuerySet, Sum

from reconciliation.models import FinancialSourceLifecycleEvent
from reconciliation.services.financial_source_lifecycle_event_service import (
    INVALIDATING_EVENT_TYPES,
)
from subscriptions.models import OperationalCancellation


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

NON_COLLECTIBLE_INVOICE_STATUSES = INACTIVE_INVOICE_STATUSES | {"DRAFT"}

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
    if getattr(invoice, "status", None) in NON_COLLECTIBLE_INVOICE_STATUSES:
        return False
    direct_sale = getattr(invoice, "direct_sale", None)
    if direct_sale is not None and not is_direct_sale_customer_active(direct_sale):
        return False
    return (getattr(invoice, "balance_total", 0) or 0) > 0


def is_payment_active_collection(payment) -> bool:
    metadata = getattr(payment, "allocation_metadata", None) or {}
    reversal = metadata.get("reversal") or {}
    return not bool(reversal.get("is_reversed"))


def filter_active_payments(queryset: QuerySet) -> QuerySet:
    """
    Return payment rows that remain active after excluding explicit reversals
    and lifecycle invalidations.

    This helper is read-only and is intended for operational summaries.
    It keeps historical rows available on detail pages while ensuring KPIs
    use active/net payment truth.
    """
    active_queryset = queryset.exclude(allocation_metadata__reversal__is_reversed=True)
    active_queryset = active_queryset.annotate(
        _has_operational_cancellation=Exists(
            OperationalCancellation.objects.filter(
                source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
                source_id=OuterRef("pk"),
            )
        ),
        _has_lifecycle_invalidation=Exists(
            FinancialSourceLifecycleEvent.objects.filter(
                source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
                source_id=OuterRef("pk"),
                event_type__in=INVALIDATING_EVENT_TYPES,
                event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            )
        ),
    )
    return active_queryset.filter(
        _has_operational_cancellation=False,
        _has_lifecycle_invalidation=False,
    )


def get_payment_collection_totals(queryset: QuerySet) -> dict[str, Decimal | int]:
    """
    Compute gross, reversed, and active payment totals for operational summaries.

    Gross = raw rows in the queryset.
    Active = rows that are not explicitly reversed/invalidated.
    Reversed = gross - active within the filtered queryset.
    """
    gross = queryset.aggregate(total=Sum("amount"), count=Count("id"))
    active_queryset = filter_active_payments(queryset)
    active = active_queryset.aggregate(total=Sum("amount"), count=Count("id"))

    gross_amount = Decimal(str(gross.get("total") or "0.00")).quantize(Decimal("0.01"))
    active_amount = Decimal(str(active.get("total") or "0.00")).quantize(Decimal("0.01"))
    gross_count = int(gross.get("count") or 0)
    active_count = int(active.get("count") or 0)

    reversed_amount = (gross_amount - active_amount).quantize(Decimal("0.01"))
    reversed_count = max(gross_count - active_count, 0)

    return {
        "gross_amount": gross_amount,
        "gross_count": gross_count,
        "active_amount": active_amount,
        "active_count": active_count,
        "reversed_amount": reversed_amount,
        "reversed_count": reversed_count,
    }


def is_receipt_active_collection(receipt) -> bool:
    if getattr(receipt, "status", None) not in ACTIVE_RECEIPT_STATUSES:
        return False
    payment = getattr(receipt, "payment", None)
    if payment is not None and not is_payment_active_collection(payment):
        return False
    return True


def is_invoice_history_only(invoice) -> bool:
    return not is_invoice_customer_active_outstanding(invoice)


def is_receipt_history_only(receipt) -> bool:
    return not is_receipt_active_collection(receipt)


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
    return ~Q(**{f"{prefix}status__in": list(NON_COLLECTIBLE_INVOICE_STATUSES)})


def receipt_active_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}status__in": list(ACTIVE_RECEIPT_STATUSES)})


def get_active_invoice_balance(queryset: QuerySet, *, prefix: str = "") -> Decimal:
    payload = queryset.filter(invoice_active_q(prefix)).aggregate(
        total=Sum(f"{prefix}balance_total")
    )
    return Decimal(str(payload.get("total") or "0.00")).quantize(Decimal("0.01"))


def get_active_receipt_total(queryset: QuerySet, *, prefix: str = "") -> Decimal:
    payload = queryset.filter(receipt_active_q(prefix)).aggregate(
        total=Sum(f"{prefix}amount")
    )
    return Decimal(str(payload.get("total") or "0.00")).quantize(Decimal("0.01"))


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
