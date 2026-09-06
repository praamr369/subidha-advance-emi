"""Consumer-protection back office: defect claims and return requests.

Both models have existed in deliveries/ since the consumer-protection work
(CTRL-CONS-1 and CTRL-CONS-3) and both already implement the hard parts — the
7-day return window, the CPA override, the refund deadline. What was missing
was any way for staff to see or act on them: the admin pages have called these
five paths since July 2026 and all five 404'd.

So this is a thin layer over logic that already exists, and deliberately so.
The window arithmetic lives on the model (`is_within_window`, `clean`), and
duplicating it here would create a second answer to "was this in time".

On the status vocabulary: the frontend's TypeScript unions guess at names the
backend does not use — 'FILED' for OPEN, 'REFUNDED' for COMPLETED, 'DANGEROUS'
for SAFETY_CRITICAL. The model's values are served as-is. They are display
strings on that page, so the mismatch is cosmetic, and inventing a translation
layer would mean two vocabularies for one state.
"""
from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from deliveries.models import ConsumerReturnRequest, DefectClaim, Repossession
from subscriptions.enums import (
    DefectClaimStatus,
    RepossessionStatus,
    ReturnRequestStatus,
)
from subscriptions.models import AuditLog


def _customer_of(subscription):
    return getattr(subscription, "customer", None)


def _defect_row(claim: DefectClaim) -> dict:
    customer = _customer_of(claim.subscription)
    return {
        "id": claim.pk,
        "subscription": claim.subscription_id,
        "subscription_number": getattr(claim.subscription, "subscription_number", "")
        or "",
        "customer_name": getattr(customer, "name", "") or "",
        "severity": claim.severity,
        "status": claim.status,
        "defect_description": claim.description,
        "product_name": getattr(
            getattr(claim.subscription, "product", None), "name", ""
        )
        or "",
        "filed_at": claim.reported_at,
        "reviewed_at": claim.resolved_at,
        "resolution_notes": claim.resolution_notes,
        "cpa_override": claim.cpa_override,
        "cpa_override_reason": claim.cpa_override_reason,
        # The page renders these two; the model does not track them yet, so
        # they are reported as false rather than fabricated from status. See
        # the note in the module docstring about not inventing state.
        "replacement_dispatched": False,
        "refund_issued": False,
    }


def _return_row(request_obj: ConsumerReturnRequest) -> dict:
    customer = _customer_of(request_obj.subscription)
    return {
        "id": request_obj.pk,
        "subscription": request_obj.subscription_id,
        "subscription_number": getattr(
            request_obj.subscription, "subscription_number", ""
        )
        or "",
        "customer_name": getattr(customer, "name", "") or "",
        "status": request_obj.status,
        "reason": request_obj.reason,
        "defect_claim": request_obj.defect_claim_id,
        "filed_at": request_obj.requested_at,
        "delivery_date": request_obj.delivery_date,
        "refund_deadline": request_obj.refund_deadline,
        # Asked of the model rather than recomputed here, so there is one
        # answer to whether a return was in time.
        "is_within_window": request_obj.is_within_window,
        "rejection_reason": request_obj.rejection_reason,
        "created_at": request_obj.created_at,
    }


# ---------------------------------------------------------------- defects ---

DEFECT_ACTIONS = {
    "review": DefectClaimStatus.UNDER_REVIEW,
    "accept": DefectClaimStatus.ACCEPTED,
    "reject": DefectClaimStatus.REJECTED,
    "resolve": DefectClaimStatus.RESOLVED,
}


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_defect_claims_view(request):
    claims = (
        DefectClaim.objects.select_related(
            "subscription", "subscription__customer", "subscription__product"
        )
        .all()
        .order_by("-reported_at")
    )
    return Response([_defect_row(claim) for claim in claims])


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_defect_claim_action_view(request, claim_id: int, action: str):
    if action not in DEFECT_ACTIONS:
        return Response(
            {"detail": f"Unknown action '{action}'.", "allowed": sorted(DEFECT_ACTIONS)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    claim = get_object_or_404(
        DefectClaim.objects.select_related(
            "subscription", "subscription__customer", "subscription__product"
        ),
        pk=claim_id,
    )
    new_status = DEFECT_ACTIONS[action]

    claim.status = new_status
    updated = ["status"]
    if request.data.get("resolution_notes"):
        claim.resolution_notes = request.data["resolution_notes"]
        updated.append("resolution_notes")
    if action in ("accept", "reject", "resolve") and claim.resolved_at is None:
        claim.resolved_at = timezone.now()
        claim.resolved_by = request.user
        updated += ["resolved_at", "resolved_by"]
    claim.save(update_fields=updated)

    AuditLog.objects.create(
        action_type=f"CONSUMER_DEFECT_{action.upper()}",
        performed_by=request.user,
        model_name="DefectClaim",
        object_id=str(claim.pk),
        metadata={"severity": claim.severity, "new_status": claim.status},
    )
    return Response(_defect_row(claim))


# ---------------------------------------------------------------- returns ---

RETURN_ACTIONS = {
    "approve": ReturnRequestStatus.APPROVED,
    "reject": ReturnRequestStatus.REJECTED,
    "complete": ReturnRequestStatus.COMPLETED,
}


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_return_requests_view(request):
    requests = (
        ConsumerReturnRequest.objects.select_related(
            "subscription", "subscription__customer"
        )
        .all()
        .order_by("-requested_at")
    )
    return Response([_return_row(item) for item in requests])


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_return_request_action_view(request, request_id: int, action: str):
    if action not in RETURN_ACTIONS:
        return Response(
            {"detail": f"Unknown action '{action}'.", "allowed": sorted(RETURN_ACTIONS)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return_request = get_object_or_404(
        ConsumerReturnRequest.objects.select_related(
            "subscription", "subscription__customer"
        ),
        pk=request_id,
    )

    if action == "reject" and not request.data.get("rejection_reason"):
        # A refusal under the Consumer Protection Act has to state why. An
        # unexplained rejection is the thing a consumer forum asks about.
        return Response(
            {"rejection_reason": ["A reason is required to reject a return."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if action == "approve" and not (
        return_request.is_within_window
        or return_request.status == ReturnRequestStatus.CPA_OVERRIDE
    ):
        # Approving outside the window is legitimate, but it is a decision
        # someone must own — that is what cpa-override records. Silently
        # allowing it here would bypass the override trail entirely.
        return Response(
            {
                "detail": (
                    "This return is outside the statutory window. Record a CPA "
                    "override first so the decision is attributable."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return_request.status = RETURN_ACTIONS[action]
    updated = ["status"]
    if action == "approve" and return_request.approved_at is None:
        return_request.approved_at = timezone.now()
        return_request.approved_by = request.user
        updated += ["approved_at", "approved_by"]
    if action == "reject":
        return_request.rejection_reason = request.data["rejection_reason"]
        updated.append("rejection_reason")
    return_request.save(update_fields=updated)

    AuditLog.objects.create(
        action_type=f"CONSUMER_RETURN_{action.upper()}",
        performed_by=request.user,
        model_name="ConsumerReturnRequest",
        object_id=str(return_request.pk),
        metadata={
            "new_status": return_request.status,
            "within_window": return_request.is_within_window,
        },
    )
    return Response(_return_row(return_request))


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_return_request_cpa_override_view(request, request_id: int):
    """Accept a return that fell outside the statutory window.

    The Consumer Protection Act lets a trader accept a late return; what it
    does not let anyone do is pretend it was in time. So this records an
    override with a named authoriser and a reason rather than editing the
    delivery date or the deadline, both of which would destroy the evidence of
    what actually happened.
    """
    return_request = get_object_or_404(
        ConsumerReturnRequest.objects.select_related(
            "subscription", "subscription__customer"
        ),
        pk=request_id,
    )

    reason = (request.data.get("reason") or "").strip()
    if not reason:
        return Response(
            {"reason": ["A reason is required to override the return window."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return_request.status = ReturnRequestStatus.CPA_OVERRIDE
    return_request.save(update_fields=["status"])

    AuditLog.objects.create(
        action_type="CONSUMER_RETURN_CPA_OVERRIDE",
        performed_by=request.user,
        model_name="ConsumerReturnRequest",
        object_id=str(return_request.pk),
        metadata={
            "reason": reason,
            "refund_deadline": str(return_request.refund_deadline)
            if return_request.refund_deadline
            else None,
            # Recorded explicitly: this is the fact the override exists to
            # acknowledge, and deriving it later depends on the deadline never
            # having been edited.
            "was_within_window": return_request.is_within_window,
        },
    )
    return Response(_return_row(return_request))


# ----------------------------------------------------------- repossessions ---
#
# Repossession is the most serious action in this file: it takes furniture back
# from a customer who has fallen behind. The model already encodes the
# safeguards — a notice must be issued, and a response deadline must pass
# before recovery begins. No endpoint existed, so those safeguards were
# unenforceable in practice and the notice trail was invisible to staff.

REPOSSESSION_ACTIONS = {
    "initiate": RepossessionStatus.IN_PROGRESS,
    "complete": RepossessionStatus.COMPLETED,
    "cancel": RepossessionStatus.CANCELLED,
}


def _repossession_row(item) -> dict:
    customer = _customer_of(item.subscription)
    return {
        "id": item.pk,
        "subscription": item.subscription_id,
        "subscription_number": getattr(item.subscription, "subscription_number", "")
        or "",
        "customer_name": getattr(customer, "name", "") or "",
        "status": item.status,
        "notice_issued_at": item.notice_issued_at,
        "notice_reference": item.notice_reference,
        "response_deadline": item.response_deadline,
        "initiated_at": item.initiated_at,
        "completed_at": item.completed_at,
        "cancelled_at": item.cancelled_at,
        "cancellation_reason": item.cancellation_reason,
        "recovery_notes": item.recovery_notes,
        "outstanding_balance_at_repossession": str(
            item.outstanding_balance_at_repossession
        ),
    }


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_repossessions_view(request):
    items = (
        Repossession.objects.select_related("subscription", "subscription__customer")
        .all()
        .order_by("-notice_issued_at")
    )
    return Response([_repossession_row(item) for item in items])


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_repossession_action_view(request, repossession_id: int, action: str):
    if action not in REPOSSESSION_ACTIONS:
        return Response(
            {
                "detail": f"Unknown action '{action}'.",
                "allowed": sorted(REPOSSESSION_ACTIONS),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    item = get_object_or_404(
        Repossession.objects.select_related("subscription", "subscription__customer"),
        pk=repossession_id,
    )

    if action == "initiate":
        # The response deadline is the customer's window to pay or dispute
        # before their furniture is taken. Starting recovery inside it defeats
        # the notice entirely, so this refuses rather than warns.
        if item.response_deadline and timezone.localdate() < item.response_deadline:
            return Response(
                {
                    "detail": (
                        "The notice response deadline has not passed "
                        f"({item.response_deadline}). Recovery cannot begin yet."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if action == "cancel" and not request.data.get("cancellation_reason"):
        return Response(
            {"cancellation_reason": ["A reason is required to cancel a repossession."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    item.status = REPOSSESSION_ACTIONS[action]
    updated = ["status"]
    now = timezone.now()
    if action == "initiate" and item.initiated_at is None:
        item.initiated_at = now
        item.initiated_by = request.user
        updated += ["initiated_at", "initiated_by"]
    if action == "complete" and item.completed_at is None:
        item.completed_at = now
        item.completed_by = request.user
        updated += ["completed_at", "completed_by"]
        if request.data.get("recovery_notes"):
            item.recovery_notes = request.data["recovery_notes"]
            updated.append("recovery_notes")
    if action == "cancel":
        item.cancelled_at = now
        item.cancellation_reason = request.data["cancellation_reason"]
        updated += ["cancelled_at", "cancellation_reason"]
    item.save(update_fields=updated)

    AuditLog.objects.create(
        action_type=f"REPOSSESSION_{action.upper()}",
        performed_by=request.user,
        model_name="Repossession",
        object_id=str(item.pk),
        metadata={
            "new_status": item.status,
            "response_deadline": str(item.response_deadline)
            if item.response_deadline
            else None,
        },
    )
    return Response(_repossession_row(item))
