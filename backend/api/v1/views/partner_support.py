"""A partner's own support tickets.

Scoped to the requesting partner on both read and write. That scoping is the
whole access control: a partner sees their tickets and no one else's, and
cannot raise a ticket in another partner's name because the partner is taken
from the authenticated user rather than the request body.
"""
from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import IsPartner
from service_desk.models import PartnerSupportTicket, PartnerSupportTicketStatus

PRIORITIES = {"LOW", "MEDIUM", "HIGH", "URGENT"}


def _row(ticket: PartnerSupportTicket) -> dict:
    return {
        "id": ticket.pk,
        "subject": ticket.subject,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "description": ticket.description,
        "response": ticket.response,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsPartner])
def partner_support_tickets_view(request):
    if request.method == "GET":
        tickets = PartnerSupportTicket.objects.filter(partner=request.user)
        return Response({"count": tickets.count(), "results": [_row(t) for t in tickets]})

    subject = str(request.data.get("subject") or "").strip()
    description = str(request.data.get("description") or "").strip()

    # Both required: a ticket with no subject cannot be triaged, and one with
    # no description cannot be answered. Rejecting here is kinder than
    # accepting a ticket nobody can act on and leaving the partner waiting.
    errors = {}
    if not subject:
        errors["subject"] = ["A subject is required."]
    if not description:
        errors["description"] = ["Describe the problem so it can be answered."]
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    priority = str(request.data.get("priority") or "MEDIUM").upper()
    if priority not in PRIORITIES:
        return Response(
            {"priority": [f"'{priority}' is not a priority."], "allowed": sorted(PRIORITIES)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        ticket = PartnerSupportTicket.objects.create(
            # From the session, never the payload — otherwise a partner could
            # file a ticket as someone else.
            partner=request.user,
            subject=subject,
            category=str(request.data.get("category") or "").strip(),
            priority=priority,
            description=description,
            status=PartnerSupportTicketStatus.OPEN,
        )
    return Response(_row(ticket), status=status.HTTP_201_CREATED)
