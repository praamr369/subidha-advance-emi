"""
Per-customer offer grants: candidates, request, approve/reject, withdraw.

All endpoints are IsAuthenticated + IsAdmin. A grant is the only thing that
moves a price for a customer, and by policy it never applies until a person
approves it — so these endpoints record who asked and who decided.

No subscription, EMI, payment or accounting record is created or mutated here.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


def _serialize_grant(g) -> dict:
    pkg = g.offer_package
    return {
        "id": g.id,
        "customer_id": g.customer_id,
        "customer_name": getattr(g.customer, "name", None),
        "offer_package_id": g.offer_package_id,
        "package_code": pkg.package_code,
        "package_name": pkg.name,
        "plan_type": pkg.plan_template.plan_type,
        "audience_type": pkg.audience_type,
        "status": g.status,
        "source": g.source,
        "expires_on": g.expires_on.isoformat() if g.expires_on else None,
        "is_live": g.is_live(),
        "note": g.note,
        "decision_note": g.decision_note,
        "requested_by": getattr(g.requested_by, "username", None),
        "decided_by": getattr(g.decided_by, "username", None),
        "decided_at": g.decided_at.isoformat() if g.decided_at else None,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


def _grant_queryset():
    from growth.models import CustomerOfferGrant

    return CustomerOfferGrant.objects.select_related(
        "customer", "offer_package", "offer_package__plan_template", "requested_by", "decided_by"
    )


def _customer_or_404(customer_id):
    from customers.models import Customer

    return get_object_or_404(Customer, pk=customer_id)


class AdminCustomerOfferCandidatesView(APIView):
    """Offers a customer's segment makes them eligible for. Advisory only."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id):
        from growth.services.customer_offer_service import list_candidate_offers

        customer = _customer_or_404(customer_id)
        plan_type = request.query_params.get("plan_type") or None
        return Response(
            {
                "customer_id": customer.id,
                "customer_name": customer.name,
                "candidates": list_candidate_offers(customer, plan_type=plan_type),
            }
        )


class AdminCustomerOfferGrantListView(APIView):
    """List a customer's grants, or request a new one (always starts PENDING)."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id):
        customer = _customer_or_404(customer_id)
        qs = _grant_queryset().filter(customer=customer)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return Response({"results": [_serialize_grant(g) for g in qs]})

    def post(self, request, customer_id):
        from growth.models import OfferPackage
        from growth.services.customer_offer_service import request_offer_grant

        customer = _customer_or_404(customer_id)
        package_id = request.data.get("offer_package_id")
        if not package_id:
            return Response(
                {"error": "offer_package_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        package = get_object_or_404(OfferPackage, pk=package_id)

        try:
            grant = request_offer_grant(
                customer=customer,
                offer_package=package,
                requested_by=request.user,
                note=request.data.get("note", ""),
                expires_on=request.data.get("expires_on") or None,
            )
        except ValidationError as exc:
            return Response(
                {"error": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(_serialize_grant(grant), status=status.HTTP_201_CREATED)


class AdminCustomerOfferGrantDecisionView(APIView):
    """Approve or reject a pending grant. Approval is what makes it price-bearing."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        from growth.services.customer_offer_service import decide_offer_grant

        grant = get_object_or_404(_grant_queryset(), pk=pk)
        approve = request.data.get("approve")
        if approve is None:
            return Response(
                {"error": "approve (true/false) is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            decide_offer_grant(
                grant=grant,
                approve=bool(approve),
                decided_by=request.user,
                decision_note=request.data.get("decision_note", ""),
            )
        except ValidationError as exc:
            return Response(
                {"error": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant.refresh_from_db()
        return Response(_serialize_grant(grant))


class AdminCustomerOfferGrantWithdrawView(APIView):
    """Pull back an approved grant, or cancel one still pending."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        from growth.services.customer_offer_service import withdraw_offer_grant

        grant = get_object_or_404(_grant_queryset(), pk=pk)
        try:
            withdraw_offer_grant(
                grant=grant,
                decided_by=request.user,
                decision_note=request.data.get("decision_note", ""),
            )
        except ValidationError as exc:
            return Response(
                {"error": exc.message_dict if hasattr(exc, "message_dict") else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant.refresh_from_db()
        return Response(_serialize_grant(grant))


class AdminCustomerOfferPendingView(APIView):
    """Every grant awaiting a decision — the approval queue."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from growth.models import CustomerOfferGrantStatus

        qs = _grant_queryset().filter(status=CustomerOfferGrantStatus.PENDING)
        return Response({"results": [_serialize_grant(g) for g in qs]})
