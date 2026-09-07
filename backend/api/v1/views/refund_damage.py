"""Damage assessment on consumer returns.

Held back when the rest of the refund surface was built, because a deduction
reduces money returned to a real customer and posts to the ledger — that needed
a stated policy, not a guess. The policy was set on 2026-09-07: a fixed
percentage per condition grade (see subscriptions.enums.DamageGrade), chosen
over per-item repair valuation so that every customer is treated by the same
written rule and the figure is answerable if disputed.

Three things this deliberately does NOT do:

  * It does not pay anything. Assessment records what the refund *should* be;
    moving money stays with the existing refund/settlement path. Keeping the
    two apart means a mis-assessment is correctable before it becomes a
    transaction.
  * It does not let staff type an arbitrary deduction. The grade determines the
    percentage. A free-text amount is exactly the discretionary figure the
    policy was chosen to avoid.
  * It does not re-derive historical assessments. The percentage and amount are
    stored on the row, so revising a band later cannot silently change what a
    customer was already told.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from deliveries.models import ConsumerReturnRequest
from subscriptions.enums import (
    DAMAGE_DEDUCTION_PERCENT,
    DamageGrade,
    ReturnRequestStatus,
)
from subscriptions.models import AuditLog

MONEY = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    """Round half-up, the convention for money in India.

    Decimal's default is ROUND_HALF_EVEN, which would round a ₹12.345 deduction
    down as often as up. That is defensible statistically and indefensible at a
    counter, where the customer wants the same answer twice.
    """
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def _assessment_row(req: ConsumerReturnRequest) -> dict:
    customer = getattr(req.subscription, "customer", None)
    return {
        "id": req.pk,
        "subscription": req.subscription_id,
        "subscription_number": getattr(req.subscription, "subscription_number", "") or "",
        "customer_name": getattr(customer, "name", "") or "",
        "status": req.status,
        "reason": req.reason,
        "requested_at": req.requested_at,
        "delivery_date": req.delivery_date,
        "refund_deadline": req.refund_deadline,
        "is_within_window": req.is_within_window,
        "damage_grade": req.damage_grade,
        "damage_grade_display": req.get_damage_grade_display() if req.damage_grade else "",
        "damage_deduction_percent": req.damage_deduction_percent,
        "damage_deduction_amount": req.damage_deduction_amount,
        "refundable_base_amount": req.refundable_base_amount,
        "refund_amount": req.refund_amount,
        "assessment_notes": req.assessment_notes,
        "assessed_at": req.assessed_at,
        "assessed_by_name": (
            (req.assessed_by.get_full_name() or req.assessed_by.get_username())
            if req.assessed_by
            else ""
        ),
        "is_assessed": bool(req.assessed_at),
    }


def _bands() -> list[dict]:
    """The published deduction table.

    Served with every assessment response so the screen shows the customer the
    same rule the calculation used, rather than a bare number.
    """
    return [
        {
            "grade": grade.value,
            "label": grade.label,
            "deduction_percent": DAMAGE_DEDUCTION_PERCENT[grade],
        }
        for grade in DamageGrade
    ]


@api_view(["GET"])
@permission_classes([IsAdmin])
def refund_inspection_jobs_view(request):
    """Returns awaiting a damage grade.

    Approved-but-unassessed is the queue that matters: the return has been
    accepted, so the customer is owed something, and the amount is unknown
    until someone inspects the item.
    """
    pending = (
        ConsumerReturnRequest.objects.select_related("subscription", "subscription__customer")
        .filter(assessed_at__isnull=True)
        .exclude(status=ReturnRequestStatus.REJECTED)
        .order_by("requested_at")
    )
    return Response(
        {
            "bands": _bands(),
            "count": pending.count(),
            "results": [_assessment_row(req) for req in pending],
        }
    )


@api_view(["GET"])
@permission_classes([IsAdmin])
def refund_assess_damage_list_view(request):
    """Everything already assessed, newest first — the audit view."""
    assessed = (
        ConsumerReturnRequest.objects.select_related(
            "subscription", "subscription__customer", "assessed_by"
        )
        .filter(assessed_at__isnull=False)
        .order_by("-assessed_at")
    )
    return Response(
        {
            "bands": _bands(),
            "count": assessed.count(),
            "results": [_assessment_row(req) for req in assessed],
        }
    )


@api_view(["GET"])
@permission_classes([IsAdmin])
def refund_inspect_view(request, request_id: int):
    """One return, with the bands, ready to grade."""
    req = get_object_or_404(
        ConsumerReturnRequest.objects.select_related(
            "subscription", "subscription__customer", "assessed_by"
        ),
        pk=request_id,
    )
    row = _assessment_row(req)
    row["bands"] = _bands()
    # What the deduction would apply to if graded now. Shown so the assessor
    # sees the base before choosing a grade, not after.
    row["current_net_paid"] = _money(req.subscription.net_paid_amount)
    return Response(row)


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def refund_assess_damage_view(request, request_id: int):
    """Grade a returned item and compute the refund.

    Rejects a re-assessment rather than overwriting one. A customer has already
    been told the first figure; changing it silently is how a dispute becomes
    unanswerable. Correcting a genuine mistake is a deliberate act that should
    leave its own trail, not a side effect of posting the form twice.
    """
    req = get_object_or_404(
        ConsumerReturnRequest.objects.select_for_update().select_related(
            "subscription", "subscription__customer"
        ),
        pk=request_id,
    )

    if req.assessed_at is not None:
        return Response(
            {
                "detail": (
                    "This return was already assessed on "
                    f"{req.assessed_at:%Y-%m-%d} as {req.damage_grade}. "
                    "Reversing an assessment is a separate action."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )

    if req.status == ReturnRequestStatus.REJECTED:
        return Response(
            {"detail": "A rejected return has nothing to refund."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    grade = str(request.data.get("damage_grade") or "").upper()
    if grade not in DamageGrade.values:
        return Response(
            {
                "damage_grade": [
                    f"'{grade}' is not a condition grade.",
                ],
                "allowed": list(DamageGrade.values),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Anything worse than GOOD withholds the customer's money, so it has to say
    # why. A bare grade is not evidence.
    notes = str(request.data.get("assessment_notes") or "").strip()
    if grade != DamageGrade.GOOD and not notes:
        return Response(
            {
                "assessment_notes": [
                    "Describe the damage. A deduction that is not explained "
                    "cannot be justified to the customer or a consumer forum."
                ]
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    percent = DAMAGE_DEDUCTION_PERCENT[DamageGrade(grade)]
    base = _money(req.subscription.net_paid_amount)
    deduction = _money(base * percent / Decimal("100"))
    refund = _money(base - deduction)

    req.damage_grade = grade
    req.damage_deduction_percent = percent
    req.damage_deduction_amount = deduction
    req.refundable_base_amount = base
    req.refund_amount = refund
    req.assessment_notes = notes
    req.assessed_at = timezone.now()
    req.assessed_by = request.user
    req.save(
        update_fields=[
            "damage_grade",
            "damage_deduction_percent",
            "damage_deduction_amount",
            "refundable_base_amount",
            "refund_amount",
            "assessment_notes",
            "assessed_at",
            "assessed_by",
        ]
    )

    AuditLog.objects.create(
        action_type="CONSUMER_RETURN_DAMAGE_ASSESSED",
        performed_by=request.user,
        model_name="ConsumerReturnRequest",
        object_id=str(req.pk),
        metadata={
            "damage_grade": grade,
            # The inputs as well as the output: reconstructing an assessment
            # from the result alone is impossible once a band is revised.
            "deduction_percent": str(percent),
            "refundable_base_amount": str(base),
            "damage_deduction_amount": str(deduction),
            "refund_amount": str(refund),
        },
    )
    return Response(_assessment_row(req))


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def refund_advance_view(request, request_id: int):
    """Move an assessed return on to the refund stage.

    The gate: nothing advances without an assessment, because advancing is the
    point at which the refund amount stops being provisional. GOOD-graded
    returns pass through this too — a zero deduction is a decision, not the
    absence of one.
    """
    req = get_object_or_404(
        ConsumerReturnRequest.objects.select_for_update().select_related("subscription"),
        pk=request_id,
    )

    if req.assessed_at is None:
        return Response(
            {
                "detail": (
                    "Assess the item's condition before advancing — the refund "
                    "amount is not known until it is graded."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if req.status == ReturnRequestStatus.COMPLETED:
        return Response(_assessment_row(req))

    req.status = ReturnRequestStatus.COMPLETED
    req.save(update_fields=["status"])

    AuditLog.objects.create(
        action_type="CONSUMER_RETURN_COMPLETE",
        performed_by=request.user,
        model_name="ConsumerReturnRequest",
        object_id=str(req.pk),
        metadata={
            "damage_grade": req.damage_grade,
            "refund_amount": str(req.refund_amount),
        },
    )
    return Response(_assessment_row(req))
