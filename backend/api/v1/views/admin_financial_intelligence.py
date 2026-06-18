"""
P4A — Financial Intelligence Readiness admin API views.

All endpoints: IsAuthenticated + IsAdmin.
No financial record is created or mutated by any endpoint in this module.
"""
from __future__ import annotations

from datetime import date

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.financial_intelligence_service import (
    build_bridge_posture,
    build_control_posture,
    build_financial_action_items,
    build_financial_intelligence_snapshot,
    build_reconciliation_posture,
)
from accounting.services.trial_balance_check_service import build_trial_balance_check
from accounting.services.liability_reconciliation_service import (
    build_liability_reconciliation_snapshot,
)


def _parse_params(request: Request) -> tuple[date | None, dict | None]:
    as_of_str = request.query_params.get("as_of")
    year_str = request.query_params.get("year")
    month_str = request.query_params.get("month")

    as_of: date | None = None
    if as_of_str:
        try:
            as_of = date.fromisoformat(as_of_str)
        except ValueError:
            raise ValueError(f"Invalid as_of date: {as_of_str!r}. Expected YYYY-MM-DD.")

    period: dict | None = None
    if year_str or month_str:
        try:
            year = int(year_str) if year_str else (as_of.year if as_of else date.today().year)
            month = int(month_str) if month_str else (as_of.month if as_of else date.today().month)
        except (TypeError, ValueError):
            raise ValueError("year and month must be integers.")
        if not (1 <= month <= 12):
            raise ValueError("month must be between 1 and 12.")
        if year < 2000:
            raise ValueError("year must be >= 2000.")
        period = {"year": year, "month": month}

    return as_of, period


class AdminFinancialIntelligenceView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/

    Returns a complete read-only financial intelligence snapshot covering:
    - Collection posture (payments, receipts, reversals)
    - Billing posture (invoices, direct sales, rent/lease demands)
    - Accounting bridge posture (bridge postings, journal status)
    - Reconciliation posture (unresolved items, stale items)
    - Customer advance / security deposit posture
    - Control close posture (exceptions, cash desk, month-end)
    - Inventory-finance posture (delivered without stock ledger)
    - Prioritised action items

    Query params:
        as_of   - YYYY-MM-DD  (optional, defaults to today)
        year    - integer      (optional, defaults to month of as_of)
        month   - integer      (optional, defaults to month of as_of)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = build_financial_intelligence_snapshot(as_of=as_of, period=period)
        return Response(snapshot, status=status.HTTP_200_OK)


class AdminFinancialIntelligenceBridgePostureView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/bridge-posture/

    Returns bridge posture section only.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result = build_bridge_posture(as_of=as_of, period=period)
        return Response(result, status=status.HTTP_200_OK)


class AdminFinancialIntelligenceReconciliationPostureView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/reconciliation-posture/

    Returns reconciliation posture section only.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result = build_reconciliation_posture(as_of=as_of, period=period)
        return Response(result, status=status.HTTP_200_OK)


class AdminFinancialIntelligenceControlPostureView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/control-posture/

    Returns control close posture section only.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result = build_control_posture(as_of=as_of, period=period)
        return Response(result, status=status.HTTP_200_OK)


class AdminFinancialIntelligenceActionItemsView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/action-items/

    Returns prioritised action items only (no full section payloads).
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        items = build_financial_action_items(as_of=as_of, period=period)
        return Response({"action_items": items, "count": len(items)}, status=status.HTTP_200_OK)


class AdminLiabilityReconciliationView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/liability-reconciliation/

    Returns the P4C Liability Reconciliation Center snapshot covering:
    - Customer advance collected / applied / refunded / expected liability
    - Security deposit collected / refunded / deducted / expected liability
    - Bridge gap detection for both subsystems
    - Active rent/lease contracts without deposit posture
    - Prioritised action items

    Admin only. No financial records are mutated.

    Query params:
        as_of   - YYYY-MM-DD  (optional, defaults to today)
        year    - integer      (optional, defaults to month of as_of)
        month   - integer      (optional, defaults to month of as_of)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result = build_liability_reconciliation_snapshot(as_of=as_of, period=period)
        return Response(result, status=status.HTTP_200_OK)


class AdminTrialBalanceCheckView(APIView):
    """
    GET /api/v1/admin/financial-intelligence/trial-balance/

    Returns the full P4B Trial Balance Automation Check payload.
    Admin-only. No financial records are mutated.

    Query params:
        as_of   - YYYY-MM-DD  (optional, defaults to today)
        year    - integer      (optional, defaults to month of as_of)
        month   - integer      (optional, defaults to month of as_of)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            as_of, period = _parse_params(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        result = build_trial_balance_check(as_of=as_of, period=period)
        return Response(result, status=status.HTTP_200_OK)
