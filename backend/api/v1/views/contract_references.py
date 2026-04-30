from __future__ import annotations

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCashierOrAdmin
from api.v1.serializers.contract_references import (
    ContractReferenceSerializer,
    UnifiedReceivableCollectSerializer,
    UnifiedReceivablePreviewSerializer,
)
from subscriptions.models import ContractReference
from subscriptions.services.contract_reference_service import (
    collect_unified_receivable,
    preview_unified_receivable_allocation,
    resolve_contract_reference_row,
    search_contract_references,
    search_receivables,
)


def _query_params(request) -> tuple[str, int]:
    query = (request.query_params.get("q") or "").strip()
    try:
        limit = int(request.query_params.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    return query, max(1, min(limit, 100))


class AdminContractReferenceListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        query, limit = _query_params(request)
        rows = search_contract_references(
            query=query,
            user=request.user,
            audience="admin",
            limit=limit,
        )
        return Response(
            {
                "count": len(rows),
                "results": ContractReferenceSerializer(rows, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class AdminReceivablesSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        query, limit = _query_params(request)
        rows = search_receivables(
            query=query,
            user=request.user,
            audience="admin",
            limit=limit,
        )
        return Response({"count": len(rows), "results": rows}, status=status.HTTP_200_OK)


class CashierReceivablesSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request, *args, **kwargs):
        query, limit = _query_params(request)
        rows = search_receivables(
            query=query,
            user=request.user,
            audience="cashier",
            limit=limit,
        )
        return Response({"count": len(rows), "results": rows}, status=status.HTTP_200_OK)


class AdminContractReferenceResolveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk, *args, **kwargs):
        reference = get_object_or_404(ContractReference, pk=pk)
        payload = resolve_contract_reference_row(reference, audience="admin")
        return Response(payload, status=status.HTTP_200_OK)


class UnifiedReceivableCollectView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]
    audience = "cashier"

    def post(self, request, *args, **kwargs):
        serializer = UnifiedReceivableCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            result, response_status = collect_unified_receivable(
                source_type=validated["source_type"],
                source_id=validated["source_id"],
                amount=validated["amount"],
                payment_method=validated["payment_method"],
                finance_account_id=validated["finance_account_id"],
                collected_by=request.user,
                reference_no=validated.get("reference_no"),
                payment_date=validated.get("payment_date"),
                branch_id=validated.get("branch_id"),
                cash_counter_id=validated.get("cash_counter_id"),
                note=validated.get("note"),
                idempotency_key=validated.get("idempotency_key"),
                contract_reference_id=validated.get("contract_reference_id"),
            )
        except ValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=response_status)


class AdminUnifiedReceivableCollectView(UnifiedReceivableCollectView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    audience = "admin"


class UnifiedReceivablePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def post(self, request, *args, **kwargs):
        serializer = UnifiedReceivablePreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        try:
            payload = preview_unified_receivable_allocation(
                source_type=validated["source_type"],
                source_id=validated["source_id"],
                amount=validated["amount"],
            )
        except ValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class AdminUnifiedReceivablePreviewView(UnifiedReceivablePreviewView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

