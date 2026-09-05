"""Customer refund-request endpoints.

The refund pages have called /api/v1/refunds/* since July 2026 and every
request 404'd — the routes were never written.

SCOPE, deliberately partial. The frontend assumes a damage-assessment domain
that does not exist: services/refunds.ts expects a `condition` of
GOOD/MINOR_DAMAGE/SEVERE_DAMAGE and an `assessDamage(id, photos,
deductionPercent)` call. No model carries a condition, damage notes, inspection
job or deduction, and a deduction directly reduces money returned to a
customer — CustomerRefund carries a finance_account and posts a journal entry,
so a guessed policy would pay the wrong amount and book it.

Those four endpoints (assess-damage, inspect, inspection-jobs, <id>/advance)
are therefore left unbuilt pending a decision on the deduction policy, who may
set it, and how it sits with the Consumer Protection Act 2019 — the codebase
already has a cpa-override concept, so this is a live legal question rather
than a modelling gap.

What is built here rests entirely on rules the models already enforce:
ConsumerReturnRequest evaluates the 7-day return window on save, honours a CPA
override from a linked defect claim, and sets a 7-day refund SLA on approval.
"""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from contracts.models import Subscription
from deliveries.models import ConsumerReturnRequest


def _customer_or_404(request):
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        raise NotFound("No customer profile is associated with this account.")
    return customer


def _row(req: ConsumerReturnRequest, *, include_internal: bool = False) -> dict:
    data = {
        "id": req.id,
        "subscription_id": req.subscription_id,
        "status": req.status,
        "reason": req.reason,
        "requested_at": req.requested_at.isoformat() if req.requested_at else None,
        "delivery_date": req.delivery_date.isoformat() if req.delivery_date else None,
        "refund_deadline": req.refund_deadline.isoformat()
        if req.refund_deadline
        else None,
        "approved_at": req.approved_at.isoformat() if req.approved_at else None,
        # The customer is told why a request fell outside the window; a bare
        # status would be unexplainable at the counter. Read from the model's
        # own property so there is one definition of the rule.
        "is_within_window": req.is_within_window,
        "return_window_days": ConsumerReturnRequest.RETURN_WINDOW_DAYS,
    }
    if include_internal:
        data["rejection_reason"] = req.rejection_reason
        data["requested_by_id"] = req.requested_by_id
        data["approved_by_id"] = req.approved_by_id
    return data


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refund_request_view(request):
    """Raise a return/refund request against the customer's own subscription.

    The window decision is not taken here: ConsumerReturnRequest.save()
    evaluates it against the delivery date and any CPA override. Duplicating
    that logic in the view would give two places for the rule to drift.
    """
    customer = _customer_or_404(request)
    subscription_id = request.data.get("subscription_id")
    reason = str(request.data.get("reason") or "").strip()

    if not subscription_id:
        return Response(
            {"detail": "subscription_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not reason:
        return Response(
            {"detail": "reason is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    subscription = get_object_or_404(
        Subscription.objects.select_related("delivery"),
        pk=subscription_id,
        customer=customer,
    )

    delivery = getattr(subscription, "delivery", None)
    if delivery is None or not delivery.delivered_date:
        return Response(
            {"detail": "This product has not been delivered yet, so it cannot be returned."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing = ConsumerReturnRequest.objects.filter(
        subscription=subscription
    ).exclude(status__in=["REJECTED", "COMPLETED"]).first()
    if existing is not None:
        return Response(
            {
                "detail": "A return request is already open for this subscription.",
                "existing_request_id": existing.id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    req = ConsumerReturnRequest.objects.create(
        subscription=subscription,
        reason=reason,
        requested_by=request.user,
        delivery_date=delivery.delivered_date,
    )
    return Response(_row(req), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def refund_status_view(request, request_id: int):
    """Status of one of the customer's own return requests."""
    customer = _customer_or_404(request)
    req = get_object_or_404(
        ConsumerReturnRequest,
        pk=request_id,
        subscription__customer=customer,
    )
    return Response(_row(req))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def refund_history_view(request):
    """Every return request this customer has raised."""
    customer = _customer_or_404(request)
    try:
        limit = min(int(request.query_params.get("limit", 20)), 100)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        limit, offset = 20, 0

    queryset = ConsumerReturnRequest.objects.filter(
        subscription__customer=customer
    ).order_by("-requested_at", "-id")
    total = queryset.count()

    return Response(
        {
            "count": total,
            "results": [_row(r) for r in queryset[offset : offset + limit]],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def refund_admin_list_view(request):
    """All return requests, for the staff processing queue."""
    queryset = ConsumerReturnRequest.objects.select_related(
        "subscription", "subscription__customer"
    ).order_by("-requested_at", "-id")

    status_filter = request.query_params.get("status")
    if status_filter:
        queryset = queryset.filter(status=status_filter)

    try:
        limit = min(int(request.query_params.get("limit", 50)), 200)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        limit, offset = 50, 0

    total = queryset.count()
    rows = []
    for req in queryset[offset : offset + limit]:
        row = _row(req, include_internal=True)
        customer = getattr(req.subscription, "customer", None)
        row["customer_id"] = getattr(customer, "id", None)
        row["customer_name"] = getattr(customer, "name", None)
        rows.append(row)

    return Response({"count": total, "results": rows})
