from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from subscriptions.services.phase4_finance_service import (
    partner_finance_summary,
    partner_linked_customer_payments,
    partner_receipt_list,
)


class PartnerFinanceSummaryView(APIView):
    """Read-only finance summary for the authenticated partner user.

    Current partner identity is accounts.User and Subscription.partner points to
    that user directly. Keep this endpoint scoped to request.user and delegate
    aggregation to the existing phase-4 finance service.
    """

    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        return Response(partner_finance_summary(partner=request.user))


class PartnerLinkedCustomerPaymentsView(APIView):
    """Read-only partner-scoped linked customer payment register."""

    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        limit_raw = (request.query_params.get("limit") or "200").strip()
        limit = int(limit_raw) if limit_raw.isdigit() and int(limit_raw) > 0 else 200
        limit = min(limit, 500)
        return Response(partner_linked_customer_payments(partner=request.user, limit=limit))


class PartnerReceiptListView(APIView):
    """Read-only partner-scoped receipt register."""

    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        limit_raw = (request.query_params.get("limit") or "200").strip()
        limit = int(limit_raw) if limit_raw.isdigit() and int(limit_raw) > 0 else 200
        limit = min(limit, 500)
        return Response(partner_receipt_list(partner=request.user, limit=limit))
