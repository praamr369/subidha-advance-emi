"""
P4D — Accounting Period Close Cockpit admin API view.

Admin-only endpoint. Read-only. No financial records are created or mutated.
"""
from __future__ import annotations

from datetime import date

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.accounting_close_cockpit_service import build_accounting_close_cockpit


def _parse_params(request: Request) -> tuple[int | None, int | None, date | None]:
    year_str = request.query_params.get("year")
    month_str = request.query_params.get("month")
    as_of_str = request.query_params.get("as_of")

    year: int | None = None
    month: int | None = None
    as_of: date | None = None

    if year_str:
        try:
            year = int(year_str)
        except (TypeError, ValueError):
            raise ValueError("year must be an integer.")
        if year < 2000:
            raise ValueError("year must be >= 2000.")

    if month_str:
        try:
            month = int(month_str)
        except (TypeError, ValueError):
            raise ValueError("month must be an integer.")
        if not (1 <= month <= 12):
            raise ValueError("month must be between 1 and 12.")

    if as_of_str:
        try:
            as_of = date.fromisoformat(as_of_str)
        except ValueError:
            raise ValueError(f"Invalid as_of date: {as_of_str!r}. Expected YYYY-MM-DD.")

    return year, month, as_of


class AdminAccountingCloseCockpitView(APIView):
    """
    GET /api/v1/admin/accounting/close-cockpit/

    Returns a read-only accounting period close cockpit combining:
    - P2C month-end close readiness
    - P4A financial intelligence snapshot
    - P4B trial balance automation check
    - P4C liability reconciliation
    - AccountingPeriod lock/close state

    Determines can_close and can_lock without mutating any record.

    Query params:
        year    - integer (optional, defaults to current month)
        month   - integer (optional, defaults to current month)
        as_of   - YYYY-MM-DD (optional, defaults to today)
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            year, month, as_of = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils import timezone

        today = timezone.localdate()
        resolved_year = year or today.year
        resolved_month = month or today.month

        cockpit = build_accounting_close_cockpit(
            year=resolved_year,
            month=resolved_month,
            as_of=as_of,
        )
        return Response(cockpit, status=status.HTTP_200_OK)
