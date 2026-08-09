"""Admin unified Service Desk control-center endpoints."""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from service_desk.services.control_center_service import (
    build_service_control_search,
    resolve_issue_timeline,
)


class AdminServiceControlSearchView(APIView):
    """GET /admin/service-desk/control-search/?q=<term> — cross-entity lookup."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        query = request.query_params.get("q") or ""
        return Response(build_service_control_search(query), status=status.HTTP_200_OK)


class AdminServiceControlResolveView(APIView):
    """GET /admin/service-desk/control-resolve/?customer=&direct_sale=&subscription=

    Returns the full product-issue timeline for the chosen anchor.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @staticmethod
    def _int(value: str | None) -> int | None:
        value = (value or "").strip()
        return int(value) if value.isdigit() else None

    def get(self, request):
        payload = resolve_issue_timeline(
            customer_id=self._int(request.query_params.get("customer")),
            direct_sale_id=self._int(request.query_params.get("direct_sale")),
            subscription_id=self._int(request.query_params.get("subscription")),
        )
        return Response(payload, status=status.HTTP_200_OK)
