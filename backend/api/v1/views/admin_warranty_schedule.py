"""Warranty service-visit scheduling for staff.

The admin claims queue already existed (/api/v1/admin/warranty-claims/), and so
did approve/reject/assess/resolve. What did not exist was the step between
approving a claim and resolving it: booking an engineer to actually visit.

The service-schedule page has called these three paths since July 2026 and all
three 404'd, so a claim could be approved and then had nowhere to go — which is
the part a waiting customer experiences.

Scheduling state lives on WarrantyClaim, not WarrantyServiceCall; see the
comment on the model fields for why.
"""
from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from service_desk.models import WarrantyClaim
from subscriptions.models import AuditLog

# A claim is "on the schedule board" once it has been approved and until the
# visit is recorded complete. Rejected claims never appear; resolved ones drop
# off. Named here rather than inlined so the board and the KPIs cannot drift.
SCHEDULABLE_CLAIM_STATUSES = ("APPROVED",)


def _schedule_row(claim: WarrantyClaim) -> dict:
    """Shape the service-schedule page was written against.

    Deliberately flat: the page renders a table, and every nested lookup here
    would be a per-row query on a list endpoint.
    """
    subscription = claim.subscription
    customer = getattr(subscription, "customer", None)

    if claim.service_completed_at is not None:
        row_status = "COMPLETED"
    elif claim.scheduled_date is not None:
        row_status = "SCHEDULED"
    else:
        row_status = "AWAITING_SCHEDULE"

    return {
        "id": claim.pk,
        "claim_id": claim.pk,
        "customer_name": getattr(customer, "name", "") or "",
        "customer_phone": getattr(customer, "phone", "") or "",
        "product_name": getattr(claim.product, "name", "") or "",
        "defect_type": claim.defect_classification,
        "defect_description": claim.defect_description,
        "preferred_date": claim.preferred_date,
        "scheduled_date": claim.scheduled_date,
        "technician_name": claim.technician_name or None,
        "status": row_status,
        # The address the engineer travels to is the customer's, which the
        # claim reaches only through the subscription.
        "address": getattr(customer, "address", "") or "",
        "service_center": claim.authorized_service_center,
        "service_completed_at": claim.service_completed_at,
    }


@api_view(["GET"])
@permission_classes([IsAdmin])
def warranty_service_schedule_view(request):
    """Every approved claim, scheduled or not.

    Unscheduled claims are included on purpose — a board that only showed
    booked visits would hide exactly the claims that need attention.
    """
    claims = (
        WarrantyClaim.objects.filter(claim_status__in=SCHEDULABLE_CLAIM_STATUSES)
        .select_related("product", "subscription", "subscription__customer")
        .order_by("scheduled_date", "claim_submitted_at")
    )
    return Response([_schedule_row(claim) for claim in claims])


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def warranty_claim_schedule_view(request, claim_id: int):
    """Book (or re-book) the service visit for an approved claim."""
    claim = get_object_or_404(
        WarrantyClaim.objects.select_related(
            "product", "subscription", "subscription__customer"
        ),
        pk=claim_id,
    )

    if claim.claim_status not in SCHEDULABLE_CLAIM_STATUSES:
        # Scheduling an unapproved claim would commit an engineer's day to work
        # that may yet be rejected, and scheduling a resolved one is a mistake
        # worth surfacing rather than silently accepting.
        return Response(
            {
                "detail": (
                    "Only approved claims can be scheduled; this one is "
                    f"{claim.claim_status}."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    scheduled_date = request.data.get("scheduled_date")
    if not scheduled_date:
        return Response(
            {"scheduled_date": ["This field is required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    was_scheduled = claim.scheduled_date
    claim.scheduled_date = scheduled_date
    claim.technician_name = request.data.get("technician_name", "") or ""
    if request.data.get("preferred_date"):
        claim.preferred_date = request.data["preferred_date"]
    # full_clean so a malformed date is a 400 from the serializer layer rather
    # than a 500 from the database.
    claim.full_clean(exclude=None, validate_unique=False)
    claim.save(
        update_fields=[
            "scheduled_date",
            "technician_name",
            "preferred_date",
            "updated_at",
        ]
    )

    AuditLog.objects.create(
        action_type="WARRANTY_SERVICE_RESCHEDULED"
        if was_scheduled
        else "WARRANTY_SERVICE_SCHEDULED",
        performed_by=request.user,
        model_name="WarrantyClaim",
        object_id=str(claim.pk),
        metadata={
            "scheduled_date": str(claim.scheduled_date),
            "technician_name": claim.technician_name,
            "previous_date": str(was_scheduled) if was_scheduled else None,
        },
    )
    return Response(_schedule_row(claim))


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def warranty_service_call_complete_view(request, claim_id: int):
    """Record that the visit happened.

    This closes the visit, not the claim. Whether the defect is actually
    resolved is a separate judgement made through the existing
    /admin/warranty-claims/<id>/resolve/ endpoint, and conflating them would
    let a completed visit silently close a claim the customer is still unhappy
    with.
    """
    claim = get_object_or_404(
        WarrantyClaim.objects.select_related(
            "product", "subscription", "subscription__customer"
        ),
        pk=claim_id,
    )

    if claim.scheduled_date is None:
        return Response(
            {"detail": "This claim has no scheduled visit to complete."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if claim.service_completed_at is not None:
        # Idempotent: the first completion timestamp is the true one.
        return Response(_schedule_row(claim))

    claim.service_completed_at = timezone.now()
    if request.data.get("technician_notes"):
        claim.assessment_notes = (
            f"{claim.assessment_notes}\n{request.data['technician_notes']}".strip()
        )
        claim.save(
            update_fields=["service_completed_at", "assessment_notes", "updated_at"]
        )
    else:
        claim.save(update_fields=["service_completed_at", "updated_at"])

    AuditLog.objects.create(
        action_type="WARRANTY_SERVICE_COMPLETED",
        performed_by=request.user,
        model_name="WarrantyClaim",
        object_id=str(claim.pk),
        metadata={
            "scheduled_date": str(claim.scheduled_date),
            "technician_name": claim.technician_name,
        },
    )
    return Response(_schedule_row(claim))
