"""Lucky-plan back office: draw authorisation and waiver visibility.

A draw is the moment this business gives something away, so DrawAuthorisation
exists as a two-person control — one person requests a month's draw, a
different person authorises it. The model has enforced that since the lucky
plan was built. What was missing was any way to *use* it: the admin page has
called these paths since July 2026 and they 404'd, which meant the control
existed on paper and the queue behind it was invisible.

Waiver settlements are read-only here, deliberately. See the note on that view.
"""
from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.v1.permissions import IsAdmin
from lucky_plan.models import DrawAuthorisation
from payments.models import EmiWaiverSettlement
from subscriptions.enums import DrawAuthorisationStatus
from subscriptions.models import AuditLog


def _user_label(user) -> str:
    if user is None:
        return ""
    return user.get_full_name() or user.get_username()


def _authorisation_row(auth: DrawAuthorisation) -> dict:
    return {
        "id": auth.pk,
        "batch": auth.batch_id,
        "batch_code": getattr(auth.batch, "code", "") or "",
        "draw_month": auth.draw_month,
        "status": auth.status,
        "requested_by": auth.requested_by_id,
        "requested_by_name": _user_label(auth.requested_by),
        "authorised_by": auth.authorised_by_id,
        "authorised_by_name": _user_label(auth.authorised_by),
        "authorised_at": auth.authorised_at,
        "rejection_reason": auth.rejection_reason,
        "revocation_reason": auth.revocation_reason,
        "created_at": auth.created_at,
    }


AUTHORISATION_ACTIONS = {
    "authorise": DrawAuthorisationStatus.AUTHORISED,
    # The frontend sends the American spelling on some paths and the British
    # one on others. Both are accepted rather than picking a fight over it at
    # the URL layer.
    "authorize": DrawAuthorisationStatus.AUTHORISED,
    "reject": DrawAuthorisationStatus.REJECTED,
    "revoke": DrawAuthorisationStatus.REVOKED,
}


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_draw_authorisations_view(request):
    authorisations = (
        DrawAuthorisation.objects.select_related(
            "batch", "requested_by", "authorised_by"
        )
        .all()
        .order_by("-created_at")
    )
    return Response([_authorisation_row(auth) for auth in authorisations])


@api_view(["POST"])
@permission_classes([IsAdmin])
@transaction.atomic
def admin_draw_authorisation_action_view(request, authorisation_id: int, action: str):
    if action not in AUTHORISATION_ACTIONS:
        return Response(
            {
                "detail": f"Unknown action '{action}'.",
                "allowed": sorted(AUTHORISATION_ACTIONS),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    auth = get_object_or_404(
        DrawAuthorisation.objects.select_related(
            "batch", "requested_by", "authorised_by"
        ),
        pk=authorisation_id,
    )
    new_status = AUTHORISATION_ACTIONS[action]

    if new_status == DrawAuthorisationStatus.AUTHORISED:
        # The entire point of this model is that the requester and the
        # authoriser are different people. Enforcing it only in the UI would
        # mean the control is advisory, and this is the one control standing
        # between a single employee and running a draw unilaterally.
        if auth.requested_by_id == request.user.id:
            return Response(
                {
                    "detail": (
                        "A draw must be authorised by someone other than the "
                        "person who requested it."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if auth.status != DrawAuthorisationStatus.PENDING:
            return Response(
                {"detail": f"Only pending draws can be authorised; this is {auth.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if new_status == DrawAuthorisationStatus.REJECTED and not request.data.get(
        "rejection_reason"
    ):
        return Response(
            {"rejection_reason": ["A reason is required to reject a draw."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if new_status == DrawAuthorisationStatus.REVOKED and not request.data.get(
        "revocation_reason"
    ):
        # Revoking an already-authorised draw is the most consequential action
        # here; an unexplained one is not auditable.
        return Response(
            {"revocation_reason": ["A reason is required to revoke an authorisation."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    auth.status = new_status
    updated = ["status"]
    if new_status == DrawAuthorisationStatus.AUTHORISED:
        auth.authorised_by = request.user
        auth.authorised_at = timezone.now()
        updated += ["authorised_by", "authorised_at"]
    if new_status == DrawAuthorisationStatus.REJECTED:
        auth.rejection_reason = request.data["rejection_reason"]
        updated.append("rejection_reason")
    if new_status == DrawAuthorisationStatus.REVOKED:
        auth.revocation_reason = request.data["revocation_reason"]
        updated.append("revocation_reason")
    auth.save(update_fields=updated)

    AuditLog.objects.create(
        action_type=f"LUCKY_DRAW_AUTHORISATION_{new_status}",
        performed_by=request.user,
        model_name="DrawAuthorisation",
        object_id=str(auth.pk),
        metadata={
            "batch": getattr(auth.batch, "code", "") or "",
            "draw_month": auth.draw_month,
            "requested_by": auth.requested_by_id,
        },
    )
    return Response(_authorisation_row(auth))


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_waiver_settlements_view(request):
    """Waivers already settled against a draw win.

    Read-only, and that is a finding rather than an omission. The admin page
    offers an "approve" button, but EmiWaiverSettlement has no approval state
    to move: creating a row *is* the settlement, and it is written by the draw
    process at the point a winner's EMIs are waived. There is nothing pending
    for a human to approve.

    Building an approve action would mean adding an approval workflow to a
    model that does not have one, and deciding whether waivers should be
    settled before or after approval — a policy question about when the
    business commits to the money, not a missing endpoint. Left for that
    decision; the list is served so the settlements are at least visible.
    """
    settlements = (
        EmiWaiverSettlement.objects.select_related(
            "lucky_draw", "subscription", "subscription__customer", "settled_by"
        )
        .all()
        .order_by("-settlement_date")
    )
    rows = []
    for settlement in settlements:
        customer = getattr(settlement.subscription, "customer", None)
        rows.append(
            {
                "id": settlement.pk,
                "lucky_draw": settlement.lucky_draw_id,
                "subscription": settlement.subscription_id,
                "customer_name": getattr(customer, "name", "") or "",
                "waived_amount": str(settlement.waived_amount),
                "settlement_date": settlement.settlement_date,
                "settled_by_name": _user_label(settlement.settled_by),
                "notes": settlement.notes,
                # Stated explicitly so the page does not have to infer it from
                # a missing field: these are settled, not awaiting approval.
                "status": "SETTLED",
            }
        )
    return Response(rows)
