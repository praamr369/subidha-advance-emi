"""Partial payment split — waterfall allocation preview across outstanding EMIs.

This view is READ-ONLY: it calculates how a payment would be distributed
across pending EMIs but does NOT create or modify any EMI/Payment records.
Staff use this preview to decide how to record individual payments.
"""
from __future__ import annotations

from decimal import Decimal
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsAdmin
from subscriptions.models import Emi, Subscription


def _emi_row(e: Emi) -> dict:
    return {
        "id": e.id,
        "month_no": e.month_no,
        "due_date": str(e.due_date),
        "amount": str(e.amount),
        "status": e.status,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def partial_payment_preview_view(request, subscription_id):
    """
    Preview outstanding EMIs for a subscription, ordered oldest-first.
    GET /admin/subscriptions/{id}/partial-payment/preview/
    """
    try:
        sub = Subscription.objects.get(pk=subscription_id)
    except Subscription.DoesNotExist:
        return Response({"error": "Subscription not found."}, status=status.HTTP_404_NOT_FOUND)

    emis = (
        Emi.objects.filter(subscription=sub, status="PENDING")
        .order_by("month_no")
    )

    rows = [_emi_row(e) for e in emis]
    total_outstanding = sum(Decimal(r["amount"]) for r in rows)

    return Response({
        "subscription_id": sub.id,
        "customer_id": sub.customer_id,
        "total_outstanding": str(total_outstanding),
        "emi_count": len(rows),
        "emis": rows,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def partial_payment_split_view(request, subscription_id):
    """
    Preview-only waterfall allocation of a partial payment across pending EMIs.
    Returns split breakdown so staff can record individual payments.

    POST /admin/subscriptions/{id}/partial-payment/split/
    Body: { "payment_amount": "5000.00" }

    NOTE: This endpoint does NOT create or modify any EMI or Payment records.
    Use existing payment recording flows to book each line item.
    """
    try:
        sub = Subscription.objects.get(pk=subscription_id)
    except Subscription.DoesNotExist:
        return Response({"error": "Subscription not found."}, status=status.HTTP_404_NOT_FOUND)

    raw_amount = request.data.get("payment_amount")
    if not raw_amount:
        return Response({"error": "payment_amount is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        remaining = Decimal(str(raw_amount))
    except Exception:
        return Response({"error": "payment_amount must be a valid decimal."}, status=status.HTTP_400_BAD_REQUEST)

    if remaining <= 0:
        return Response({"error": "payment_amount must be positive."}, status=status.HTTP_400_BAD_REQUEST)

    emis = (
        Emi.objects.filter(subscription=sub, status="PENDING")
        .order_by("month_no")
    )

    split_log = []
    total_allocated = Decimal("0")

    for emi in emis:
        if remaining <= 0:
            break

        allocated = min(remaining, emi.amount)
        remaining -= allocated
        total_allocated += allocated

        split_log.append({
            "emi_id": emi.id,
            "month_no": emi.month_no,
            "due_date": str(emi.due_date),
            "emi_amount": str(emi.amount),
            "allocated": str(allocated),
            "fully_covered": allocated >= emi.amount,
        })

    return Response({
        "subscription_id": sub.id,
        "payment_amount_input": str(Decimal(str(raw_amount))),
        "total_allocated": str(total_allocated),
        "remaining_unallocated": str(remaining),
        "emis_covered": len(split_log),
        "split": split_log,
        "note": "Preview only — record each payment via the standard payment flow.",
    })
