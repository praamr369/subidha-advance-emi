"""
P2C — Month-end close and data quality admin API views.

All endpoints: IsAuthenticated + IsAdmin.
No financial record is mutated.
"""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.control_month_end_close_service import (
    build_month_end_close_run_payload,
    get_month_end_readiness,
    run_month_end_close,
)
from subscriptions.services.control_data_quality_service import get_data_quality_report
from subscriptions.models_month_end_close import MonthEndCloseRun, MonthEndCloseStatus


class AdminMonthEndReadinessView(APIView):
    """
    GET /api/v1/admin/control/month-end-close/readiness/
    Query params: year, month, branch_id (optional)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        try:
            year = int(request.query_params.get("year", 0))
            month = int(request.query_params.get("month", 0))
        except (TypeError, ValueError):
            return Response({"error": "year and month must be integers."}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12) or year < 2000:
            return Response(
                {"error": "Provide valid year (>=2000) and month (1-12)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch = None
        branch_id = request.query_params.get("branch_id")
        if branch_id:
            try:
                from branch_control.models import Branch
                branch = Branch.objects.get(pk=int(branch_id))
            except Exception:
                return Response({"error": f"Branch {branch_id} not found."}, status=status.HTTP_400_BAD_REQUEST)

        payload = get_month_end_readiness(year=year, month=month, branch=branch)
        return Response(payload)


class AdminMonthEndExecuteView(APIView):
    """
    POST /api/v1/admin/control/month-end-close/execute/
    Body: { year, month, is_dry_run, branch_id (optional), notes (optional) }
    Returns 201 for DRY_RUN or EXECUTED, 409 for BLOCKED.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request: Request) -> Response:
        data = request.data
        try:
            year = int(data.get("year", 0))
            month = int(data.get("month", 0))
        except (TypeError, ValueError):
            return Response({"error": "year and month must be integers."}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= month <= 12) or year < 2000:
            return Response(
                {"error": "Provide valid year (>=2000) and month (1-12)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_dry_run = bool(data.get("is_dry_run", True))
        notes = str(data.get("notes", "")).strip()

        branch = None
        branch_id = data.get("branch_id")
        if branch_id:
            try:
                from branch_control.models import Branch
                branch = Branch.objects.get(pk=int(branch_id))
            except Exception:
                return Response({"error": f"Branch {branch_id} not found."}, status=status.HTTP_400_BAD_REQUEST)

        run = run_month_end_close(
            year=year,
            month=month,
            run_by=request.user,
            is_dry_run=is_dry_run,
            branch=branch,
            notes=notes,
        )

        payload = build_month_end_close_run_payload(run)

        if run.status == MonthEndCloseStatus.BLOCKED:
            return Response(payload, status=status.HTTP_409_CONFLICT)

        return Response(payload, status=status.HTTP_201_CREATED)


class AdminMonthEndHistoryView(APIView):
    """
    GET /api/v1/admin/control/month-end-close/history/
    Query params: year, month (optional filters)
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        qs = MonthEndCloseRun.objects.select_related("run_by", "branch").order_by("-run_at", "-id")

        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if year:
            try:
                qs = qs.filter(period_year=int(year))
            except (TypeError, ValueError):
                pass
        if month:
            try:
                qs = qs.filter(period_month=int(month))
            except (TypeError, ValueError):
                pass

        runs = list(qs[:50])
        payload = [build_month_end_close_run_payload(r) for r in runs]
        return Response({"count": len(payload), "results": payload})


class AdminDataQualityView(APIView):
    """
    GET /api/v1/admin/data-quality/
    Returns the full DQ check report (read-only, no data mutated).
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        report = get_data_quality_report()
        return Response(report)
