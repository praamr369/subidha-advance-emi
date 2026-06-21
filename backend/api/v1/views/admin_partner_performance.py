"""
P5C — Partner Performance: admin read-only API views.

All endpoints: IsAdmin. Read-only advisory data.
No Commission, Payout, Payment, Subscription, EMI, or record is mutated.
"""
from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.partner_performance_service import (
    build_partner_performance_snapshot,
    list_partner_performance,
)


class AdminPartnerPerformanceListView(APIView):
    """GET /api/v1/admin/growth/partner-performance/"""

    permission_classes = [IsAdmin]

    def get(self, request):
        as_of_str = request.query_params.get("as_of")
        as_of = None
        if as_of_str:
            try:
                as_of = date.fromisoformat(as_of_str)
            except ValueError:
                return Response({"detail": "Invalid as_of date."}, status=status.HTTP_400_BAD_REQUEST)
        results = list_partner_performance(as_of=as_of)
        return Response({"results": results})


class AdminPartnerPerformanceDetailView(APIView):
    """GET /api/v1/admin/growth/partner-performance/{partner_id}/"""

    permission_classes = [IsAdmin]

    def get(self, request, partner_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            partner = User.objects.get(pk=partner_id, role="PARTNER")
        except User.DoesNotExist:
            return Response({"detail": "Partner not found."}, status=status.HTTP_404_NOT_FOUND)
        as_of_str = request.query_params.get("as_of")
        as_of = None
        if as_of_str:
            try:
                as_of = date.fromisoformat(as_of_str)
            except ValueError:
                return Response({"detail": "Invalid as_of date."}, status=status.HTTP_400_BAD_REQUEST)
        snapshot = build_partner_performance_snapshot(partner, as_of=as_of)
        return Response(snapshot)
