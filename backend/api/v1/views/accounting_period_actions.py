from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import AccountingPeriodSerializer, FinancialYearSerializer
from accounting.services.period_service import build_accounting_period_readiness, generate_current_period


class AccountingGenerateCurrentPeriodView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        try:
            result = generate_current_period(performed_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc), "readiness": _readiness_payload(request)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "created": result["created"],
                "detail": result["detail"],
                "financial_year": FinancialYearSerializer(result["financial_year"], context={"request": request}).data,
                "period": AccountingPeriodSerializer(result["period"], context={"request": request}).data,
                "readiness": _readiness_payload(request),
            },
            status=status.HTTP_200_OK,
        )


def _readiness_payload(request) -> dict:
    readiness = build_accounting_period_readiness()
    return {
        "reference_date": readiness["reference_date"],
        "active_financial_year": FinancialYearSerializer(readiness["active_financial_year"], context={"request": request}).data if readiness["active_financial_year"] is not None else None,
        "current_period": AccountingPeriodSerializer(readiness["current_period"], context={"request": request}).data if readiness["current_period"] is not None else None,
        "is_ready": readiness["is_ready"],
        "errors": readiness["errors"],
        "warnings": readiness["warnings"],
        "blocker_items": readiness.get("blocker_items") or [],
        "recommended_actions": readiness.get("recommended_actions") or [],
    }
