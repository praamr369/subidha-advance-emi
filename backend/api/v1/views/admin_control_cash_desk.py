"""
P2B — Admin API views for CashCounterSession and DailyClose.

All endpoints are IsAdmin-gated. No financial record is mutated.
Additive. Does not touch existing payment, EMI, or accounting views.
"""
from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from branch_control.models import CashCounter
from subscriptions.models_cash_counter_session import (
    CashCounterSession,
    CashCounterSessionStatus,
    DailyCloseRun,
)
from subscriptions.services.control_cash_counter_service import (
    approve_cash_variance,
    close_cash_counter_session,
    get_cash_counter_session_status,
    open_cash_counter_session,
)
from subscriptions.services.control_daily_close_service import (
    build_daily_close_run_payload,
    get_daily_close_readiness,
    run_daily_close,
)


def _parse_date(value: str | None, fallback: date_type | None = None) -> date_type | None:
    if not value:
        return fallback
    try:
        return date_type.fromisoformat(str(value).strip())
    except ValueError:
        return fallback


def _parse_decimal(value, field_name: str) -> tuple[Decimal | None, str | None]:
    try:
        d = Decimal(str(value).strip())
        if d < Decimal("0"):
            return None, f"{field_name} cannot be negative."
        return d, None
    except (InvalidOperation, TypeError, ValueError):
        return None, f"{field_name} must be a valid decimal number."


# ─────────────────────────────────────────────
# Cash Counter Session endpoints
# ─────────────────────────────────────────────

class AdminCashSessionListView(APIView):
    """GET /api/v1/admin/control/cash-sessions/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = CashCounterSession.objects.select_related(
            "branch", "cash_counter", "cashier", "opened_by", "closed_by", "approved_by"
        ).order_by("-session_date", "-opened_at")

        session_date = _parse_date(request.query_params.get("session_date"))
        if session_date:
            qs = qs.filter(session_date=session_date)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        counter_id = request.query_params.get("cash_counter_id")
        if counter_id:
            qs = qs.filter(cash_counter_id=counter_id)

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        return Response({"results": [get_cash_counter_session_status(session=s) for s in qs[:200]]})


class AdminCashSessionOpenView(APIView):
    """POST /api/v1/admin/control/cash-sessions/open/

    Body: {cash_counter_id, cashier_id, session_date, opening_cash?, notes?}
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        counter_id = request.data.get("cash_counter_id")
        if not counter_id:
            return Response({"detail": "cash_counter_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        counter = get_object_or_404(CashCounter, pk=counter_id, is_active=True)

        cashier_id = request.data.get("cashier_id")
        if not cashier_id:
            return Response({"detail": "cashier_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        from accounts.models import User
        cashier = get_object_or_404(User, pk=cashier_id)

        raw_date = request.data.get("session_date")
        session_date = _parse_date(raw_date, fallback=timezone.localdate())

        opening_cash_raw = request.data.get("opening_cash", "0")
        opening_cash, err = _parse_decimal(opening_cash_raw, "opening_cash")
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = open_cash_counter_session(
                cash_counter=counter,
                cashier=cashier,
                session_date=session_date,
                opening_cash=opening_cash,
                notes=request.data.get("notes", ""),
                opened_by=request.user,
            )
        except (ValueError, Exception) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(get_cash_counter_session_status(session=session), status=status.HTTP_201_CREATED)


class AdminCashSessionCloseView(APIView):
    """POST /api/v1/admin/control/cash-sessions/{id}/close/

    Body: {declared_cash, notes?}
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        session = get_object_or_404(CashCounterSession, pk=pk)

        declared_raw = request.data.get("declared_cash")
        if declared_raw is None:
            return Response({"detail": "declared_cash is required."}, status=status.HTTP_400_BAD_REQUEST)

        declared_cash, err = _parse_decimal(declared_raw, "declared_cash")
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updated = close_cash_counter_session(
                session=session,
                declared_cash=declared_cash,
                closed_by=request.user,
                notes=request.data.get("notes", ""),
            )
        except (ValueError, Exception) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(get_cash_counter_session_status(session=updated))


class AdminCashSessionApproveVarianceView(APIView):
    """POST /api/v1/admin/control/cash-sessions/{id}/approve-variance/

    Body: {notes?}
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        session = get_object_or_404(CashCounterSession, pk=pk)
        try:
            updated = approve_cash_variance(
                session=session,
                approved_by=request.user,
                notes=request.data.get("notes", ""),
            )
        except (ValueError, Exception) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(get_cash_counter_session_status(session=updated))


# ─────────────────────────────────────────────
# Daily Close endpoints
# ─────────────────────────────────────────────

class AdminDailyCloseReadinessView(APIView):
    """GET /api/v1/admin/control/daily-close/readiness/?run_date=YYYY-MM-DD&branch_id="""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        run_date = _parse_date(request.query_params.get("run_date"), fallback=timezone.localdate())

        branch = None
        branch_id = request.query_params.get("branch_id")
        if branch_id:
            from branch_control.models import Branch
            branch = Branch.objects.filter(pk=branch_id).first()

        payload = get_daily_close_readiness(run_date=run_date, branch=branch)
        return Response(payload)


class AdminDailyCloseExecuteView(APIView):
    """POST /api/v1/admin/control/daily-close/execute/

    Body: {run_date?, branch_id?, is_dry_run?}
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        run_date = _parse_date(
            request.data.get("run_date"),
            fallback=timezone.localdate(),
        )

        branch = None
        branch_id = request.data.get("branch_id")
        if branch_id:
            from branch_control.models import Branch
            branch = Branch.objects.filter(pk=branch_id).first()

        is_dry_run_raw = request.data.get("is_dry_run", True)
        is_dry_run = bool(is_dry_run_raw) if not isinstance(is_dry_run_raw, bool) else is_dry_run_raw

        try:
            close_run = run_daily_close(
                run_date=run_date,
                run_by=request.user,
                branch=branch,
                is_dry_run=is_dry_run,
                metadata={"requested_by": request.user.username},
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payload = build_daily_close_run_payload(close_run)
        http_status = (
            status.HTTP_201_CREATED
            if close_run.status in ("EXECUTED", "DRY_RUN")
            else status.HTTP_409_CONFLICT
        )
        return Response(payload, status=http_status)


class AdminDailyCloseHistoryView(APIView):
    """GET /api/v1/admin/control/daily-close/history/?run_date="""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = DailyCloseRun.objects.prefetch_related("check_results").order_by("-run_date", "-created_at")

        run_date = _parse_date(request.query_params.get("run_date"))
        if run_date:
            qs = qs.filter(run_date=run_date)

        return Response({"results": [build_daily_close_run_payload(r) for r in qs[:100]]})
