"""
P5D — Customer Retention Intelligence: admin read-only API views.

All endpoints: IsAdmin. Read-only advisory data.
No Payment, EMI, Subscription, Document, or record is mutated.
No external notification is sent.
"""
from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.customer_retention_intelligence_service import (
    build_customer_retention_profile,
    list_retention_opportunities,
)


class AdminRetentionListView(APIView):
    """GET /api/v1/admin/growth/retention/"""

    permission_classes = [IsAdmin]

    def get(self, request):
        as_of_str = request.query_params.get("as_of")
        as_of = None
        if as_of_str:
            try:
                as_of = date.fromisoformat(as_of_str)
            except ValueError:
                return Response({"detail": "Invalid as_of date."}, status=status.HTTP_400_BAD_REQUEST)
        results = list_retention_opportunities(as_of=as_of)
        return Response({"results": results, "total": len(results)})


class AdminCustomerRetentionView(APIView):
    """GET /api/v1/admin/customers/{id}/retention/"""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        from subscriptions.models import Customer
        try:
            customer = Customer.objects.get(pk=pk)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        as_of_str = request.query_params.get("as_of")
        as_of = None
        if as_of_str:
            try:
                as_of = date.fromisoformat(as_of_str)
            except ValueError:
                return Response({"detail": "Invalid as_of date."}, status=status.HTTP_400_BAD_REQUEST)
        profile = build_customer_retention_profile(customer, as_of=as_of)
        return Response(profile)
