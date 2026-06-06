from __future__ import annotations

from django.utils.dateparse import parse_date
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.accounting_bridge_reconciliation_read_service import (
    BridgeReconciliationFilters,
    build_accounting_bridge_reconciliation,
)


class AccountingBridgeReconciliationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        filters = BridgeReconciliationFilters(
            module=(request.query_params.get("module") or "").strip() or None,
            event_key=(request.query_params.get("event_key") or "").strip() or None,
            date_from=parse_date(request.query_params.get("date_from") or ""),
            date_to=parse_date(request.query_params.get("date_to") or ""),
            status=(request.query_params.get("status") or "").strip().upper() or None,
            customer=(request.query_params.get("customer") or "").strip() or None,
            vendor=(request.query_params.get("vendor") or "").strip() or None,
            partner=(request.query_params.get("partner") or "").strip() or None,
            financial_year=(request.query_params.get("financial_year") or "").strip() or None,
            accounting_period=(request.query_params.get("accounting_period") or "").strip() or None,
            source_type=(request.query_params.get("source_type") or "").strip() or None,
            source_model=(request.query_params.get("source_model") or "").strip() or None,
            account=(request.query_params.get("account") or "").strip() or None,
        )
        return Response(build_accounting_bridge_reconciliation(filters))
