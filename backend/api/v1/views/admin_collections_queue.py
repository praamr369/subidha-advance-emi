"""Collection queues: what is due today, what is overdue, what was just paid.

The three screens a person collecting money actually works from. The data has
always existed on Emi and Payment; these paths were called by
services/collections.service.ts and never mounted, so the queues rendered empty.

Note this is a different thing from /admin/collections/control-center/, which
despite the similar name is about finance-account readiness (which account a
payment can be posted to), not about which customers owe money today.

Amounts are computed from the ledger rather than stored on the EMI: a partly
paid EMI is still due for the remainder, and an EMI's `amount` field is the
original instalment, not the balance.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from payments.models import Emi, Payment

# Overdue bands. Named rather than inlined so the thresholds are reviewable —
# these drive what a collector chases first, so they are a business judgement,
# not a display detail.
RISK_BANDS = (
    (60, "CRITICAL"),
    (30, "HIGH"),
    (7, "MEDIUM"),
)

RECENT_LIMIT = 50
# The real choices are PENDING/OVERDUE/PAID/WAIVED/CANCELLED. A WAIVED or
# CANCELLED EMI is settled, not owed, and must never appear in a collection
# queue — chasing a waived instalment is exactly the error that erodes trust
# with a draw winner.
UNPAID_STATUSES = ("PENDING", "OVERDUE")


def _risk_level(overdue_days: int) -> str:
    for threshold, label in RISK_BANDS:
        if overdue_days >= threshold:
            return label
    return "LOW"


def _paid_by_emi(emi_ids):
    """Total already received against each EMI, in one query.

    Doing this per row would be an N+1 on the exact screen most likely to hold
    hundreds of rows.
    """
    rows = (
        Payment.objects.filter(emi_id__in=emi_ids)
        .values("emi_id")
        .annotate(paid=Sum("amount"))
    )
    return {row["emi_id"]: row["paid"] or Decimal("0") for row in rows}


def _queue_rows(emis, today):
    paid_map = _paid_by_emi([e.pk for e in emis])
    rows = []
    for emi in emis:
        subscription = emi.subscription
        customer = getattr(subscription, "customer", None)
        paid = paid_map.get(emi.pk, Decimal("0"))
        outstanding = (emi.amount or Decimal("0")) - paid
        if outstanding <= 0:
            # Fully covered but not yet marked paid — a status lag, not a debt.
            # Listing it would send a collector after money already received.
            continue
        overdue_days = max((today - emi.due_date).days, 0) if emi.due_date else 0
        rows.append(
            {
                "id": emi.pk,
                "customerId": getattr(customer, "id", None),
                "customerName": getattr(customer, "name", "") or "",
                "subscriptionId": emi.subscription_id,
                "subscriptionCode": getattr(subscription, "subscription_number", "") or "",
                "batchName": getattr(getattr(subscription, "batch", None), "code", "") or "",
                "luckyId": str(getattr(subscription, "lucky_id_id", "") or ""),
                "installmentNo": emi.month_no,
                "amountDue": emi.amount,
                # Penalties are not modelled on the EMI. Reported as 0 rather
                # than invented, so the collector is never shown a figure the
                # system cannot justify at the counter.
                "penaltyAmount": Decimal("0.00"),
                "payableNow": outstanding,
                "overdueDays": overdue_days,
                "riskLevel": _risk_level(overdue_days),
                "status": emi.status,
            }
        )
    return rows


def _base_queryset():
    return Emi.objects.select_related(
        "subscription", "subscription__customer", "subscription__batch"
    ).filter(status__in=UNPAID_STATUSES)


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_collections_due_today_view(request):
    today = timezone.localdate()
    emis = _base_queryset().filter(due_date=today).order_by("subscription_id", "month_no")
    return Response(_queue_rows(emis, today))


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_collections_overdue_view(request):
    """Past due and still owing, oldest first — the order they should be worked."""
    today = timezone.localdate()
    emis = _base_queryset().filter(due_date__lt=today).order_by("due_date", "subscription_id")
    return Response(_queue_rows(emis, today))


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_collections_recent_view(request):
    """Recently received payments.

    Capped rather than paginated: this is a "what just happened" panel beside
    the queues, and an unbounded list of every payment ever taken would be both
    slow and useless in that role.
    """
    payments = (
        Payment.objects.select_related("customer", "subscription")
        .all()
        .order_by("-payment_date", "-id")[:RECENT_LIMIT]
    )
    return Response(
        [
            {
                "id": payment.pk,
                "customerName": getattr(payment.customer, "name", "") or "",
                "subscriptionId": payment.subscription_id,
                "amount": payment.amount,
                "paymentReference": payment.reference_no or "",
                "paidAt": payment.payment_date,
            }
            for payment in payments
        ]
    )
