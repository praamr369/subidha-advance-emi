"""
Solopreneur Finance Cockpit API views.
"""
from __future__ import annotations

import logging
from datetime import date

from django.core.cache import cache
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.solopreneur_finance_service import run_solopreneur_daily_close

logger = logging.getLogger(__name__)


class AdminSolopreneurDailyCloseView(APIView):
    """
    POST /api/v1/admin/accounting/solopreneur-close/
    
    Executes all unposted bridge records up to today (or the specified date).
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request: Request) -> Response:
        as_of_str = request.data.get("as_of")
        dry_run = request.data.get("dry_run", False)
        full_rescan = request.data.get("full_rescan", False)
        as_of = None
        
        if as_of_str:
            try:
                as_of = date.fromisoformat(as_of_str)
            except ValueError:
                return Response({"error": "Invalid as_of date. Expected YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = run_solopreneur_daily_close(
                as_of=as_of,
                performed_by=request.user,
                dry_run=bool(dry_run),
                full_rescan=bool(full_rescan)
            )
            # Invalidate health cache after successful or partial run
            cache.delete("solopreneur:ledger-health")
            
            return Response(result, status=status.HTTP_200_OK)
        except (ValueError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error in AdminSolopreneurDailyCloseView")
            return Response({"error": "An unexpected error occurred while posting daily close."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminSolopreneurLedgerHealthView(APIView):
    """
    GET /api/v1/admin/accounting/ledger-health/
    
    Returns a unified readout of unposted items, cash balance, and any reconciliation gaps.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        cache_key = "solopreneur:ledger-health"
        cached_data = cache.get(cache_key)
        
        if cached_data:
            return Response(cached_data, status=status.HTTP_200_OK)
            
        from accounting.services.trial_balance_check_service import build_trial_balance_check
        
        today = timezone.localdate()
        
        # Build quick health check
        tb = build_trial_balance_check(
            as_of=today,
            period={"year": today.year, "month": today.month},
        )
        
        is_balanced = tb.get("is_balanced", False)
        
        response_data = {
            "status": "OK" if is_balanced else "WARNING",
            "is_balanced": is_balanced,
            "total_debit": tb.get("total_debit", "0.00"),
            "total_credit": tb.get("total_credit", "0.00"),
            "difference": tb.get("difference", "0.00"),
            "checks": tb.get("checks", []),
        }
        
        cache.set(cache_key, response_data, 30) # 30s cache
        
        return Response(response_data, status=status.HTTP_200_OK)
