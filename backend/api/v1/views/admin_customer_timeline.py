"""
P3D — Admin read-only customer timeline endpoint.

GET /api/v1/admin/customers/<id>/timeline/

Query params (all optional):
  event_type      — exact match filter
  source_model    — exact match filter
  date_from       — YYYY-MM-DD inclusive lower bound
  date_to         — YYYY-MM-DD inclusive upper bound
  limit           — integer, caps result count
  ordering        — "desc" (default, newest first) or "asc"

Access: Admin only. Customer and partner roles receive HTTP 403.
"""
from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import Customer
from subscriptions.services.customer_timeline_service import get_customer_timeline


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _parse_limit(value: str | None) -> int | None:
    if not value:
        return None
    try:
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (ValueError, TypeError):
        return None


class AdminCustomerTimelineView(APIView):
    """
    GET /api/v1/admin/customers/<id>/timeline/

    Returns read-only aggregated timeline for the customer.
    All events are derived from real source records.
    """

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        try:
            customer = Customer.objects.get(pk=pk)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        params = request.query_params
        result = get_customer_timeline(
            customer,
            event_type=params.get("event_type") or None,
            source_model=params.get("source_model") or None,
            date_from=_parse_date(params.get("date_from")),
            date_to=_parse_date(params.get("date_to")),
            limit=_parse_limit(params.get("limit")),
            ordering=params.get("ordering", "desc"),
        )
        return Response(result)
