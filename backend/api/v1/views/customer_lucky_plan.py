"""Customer-facing lucky plan endpoints.

The customer lucky-plan pages have called /api/v1/lucky-plan/* since July 2026
and every request 404'd — the routes were never written.

SCOPE. Only the three customer views that have no existing equivalent:
eligibility, lucky-id tracker, and waiver history. Deliberately excluded:

  * /lucky-plan/draw-results/ and /{id}/ duplicate the working
    /api/v1/customer/lucky-draws/ and /<pk>/. This is a cryptographic draw
    system; a second implementation computing results independently is an
    integrity problem, not merely duplication.
  * /lucky-plan/draw-audit/ duplicates /api/v1/admin/lucky-draws/<pk>/timeline/.
  * /public/lucky-plan/verify-seed/ overlaps
    /api/v1/public/lucky-draws/<id>/verification/ with a different contract.
    Public verifiability is the whole basis of trust in the draw, so a second
    verification path needs a deliberate decision about which one is canonical.

All three are read-only and scoped to the requesting customer.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Max, Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from contracts.models import Subscription
from lucky_plan.models import DrawEligibilitySnapshot, LuckyIdStatus
from payments.models import EmiWaiverSettlement
from subscriptions.enums import PlanType, SubscriptionStatus

MONEY_ZERO = Decimal("0.00")


def _customer_or_404(request):
    customer = getattr(request.user, "customer_profile", None)
    if customer is None:
        raise NotFound("No customer profile is associated with this account.")
    return customer


def _active_emi_subscription(customer):
    """The customer's EMI subscription that a draw would consider."""
    return (
        Subscription.objects.filter(
            customer=customer,
            plan_type=PlanType.EMI,
        )
        .select_related("lucky_id", "batch", "product")
        .order_by("-start_date", "-id")
        .first()
    )


def _eligibility_for(subscription) -> tuple[bool, str]:
    """Whether this subscription would be entered into its batch's draw.

    Mirrors lucky_draw_service._eligible_winner_subscriptions, including the
    part that matters most: once a batch's eligibility is frozen into a
    DrawEligibilitySnapshot, that snapshot decides — not the live filter.
    Telling a customer they are eligible when the frozen draw excludes them
    would be a promise the draw cannot keep.
    """
    batch = subscription.batch
    if batch is None:
        return False, "This subscription is not part of a lucky plan batch."

    snapshot_exists = DrawEligibilitySnapshot.objects.filter(batch=batch).exists()
    if snapshot_exists:
        latest = DrawEligibilitySnapshot.objects.filter(batch=batch).aggregate(
            v=Max("snapshot_version")
        )["v"]
        in_snapshot = DrawEligibilitySnapshot.objects.filter(
            batch=batch, snapshot_version=latest, subscription=subscription
        ).exists()
        if in_snapshot:
            return True, "Entered into this batch's draw."
        return (
            False,
            "This batch's entries are locked and this subscription is not among them.",
        )

    if subscription.status != SubscriptionStatus.ACTIVE:
        return False, f"Subscription is {subscription.status}, not active."
    if subscription.lucky_id is None:
        return False, "No lucky ID has been assigned yet."
    if subscription.lucky_id.status != LuckyIdStatus.ASSIGNED:
        return False, f"Lucky ID is {subscription.lucky_id.status}, not assigned."

    return True, "Eligible for the next draw in this batch."


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lucky_plan_eligibility_view(request):
    """Whether the customer is entered into their batch's draw, and why."""
    customer = _customer_or_404(request)
    subscription = _active_emi_subscription(customer)

    if subscription is None:
        return Response(
            {
                "is_eligible": False,
                "reason": "No EMI subscription found for this account.",
                "subscription_status": None,
                "paid_amount": "0.00",
                "overdue_amount": "0.00",
            }
        )

    is_eligible, reason = _eligibility_for(subscription)

    paid = subscription.emis.filter(status="PAID").aggregate(t=Sum("amount"))["t"]
    overdue = subscription.emis.filter(status="OVERDUE").aggregate(t=Sum("amount"))["t"]

    return Response(
        {
            "is_eligible": is_eligible,
            "reason": reason,
            "subscription_id": subscription.id,
            "subscription_status": subscription.status,
            "current_batch_id": subscription.batch_id,
            "batch_code": getattr(subscription.batch, "batch_code", None),
            "lucky_id": getattr(subscription.lucky_id, "lucky_number", None),
            "paid_amount": str(paid or MONEY_ZERO),
            "overdue_amount": str(overdue or MONEY_ZERO),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lucky_plan_lucky_id_view(request):
    """The customer's lucky ID and its standing."""
    customer = _customer_or_404(request)
    subscription = _active_emi_subscription(customer)

    if subscription is None or subscription.lucky_id is None:
        return Response(
            {
                "has_lucky_id": False,
                "reason": "No lucky ID has been assigned to this account yet.",
            }
        )

    lucky_id = subscription.lucky_id
    return Response(
        {
            "has_lucky_id": True,
            "lucky_id": lucky_id.lucky_number,
            "status": lucky_id.status,
            # WON is the draw's own record that this ID was drawn, so it is
            # reported rather than recomputed here.
            "is_winner": lucky_id.status == LuckyIdStatus.WON,
            "batch_id": lucky_id.batch_id,
            "batch_code": getattr(lucky_id.batch, "batch_code", None),
            "subscription_id": subscription.id,
            "assigned_at": lucky_id.created_at.isoformat()
            if lucky_id.created_at
            else None,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lucky_plan_waiver_history_view(request):
    """EMI waivers settled for this customer after winning a draw."""
    customer = _customer_or_404(request)

    try:
        limit = min(int(request.query_params.get("limit", 20)), 100)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        limit, offset = 20, 0

    queryset = (
        EmiWaiverSettlement.objects.filter(subscription__customer=customer)
        .select_related("lucky_draw", "emi", "subscription")
        .order_by("-settlement_date", "-id")
    )
    total = queryset.count()
    total_waived = queryset.aggregate(t=Sum("waived_amount"))["t"] or MONEY_ZERO

    rows = [
        {
            "id": row.id,
            "draw_id": row.lucky_draw_id,
            "subscription_id": row.subscription_id,
            "emi_id": row.emi_id,
            "emi_month_no": getattr(row.emi, "month_no", None),
            "waived_amount": str(row.waived_amount),
            "settlement_date": row.settlement_date.isoformat()
            if row.settlement_date
            else None,
            "notes": row.notes,
        }
        for row in queryset[offset : offset + limit]
    ]

    return Response(
        {
            "count": total,
            "total_waived_amount": str(total_waived),
            "results": rows,
        }
    )
