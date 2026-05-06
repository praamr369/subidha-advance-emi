from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.operational_cancellation import (
    ReversalCaseCreateSerializer,
    ReversalCaseTransitionSerializer,
)
from accounting.services.reversal_control_service import (
    approve_reversal_case,
    get_reversal_case,
    list_reversal_cases,
    open_reversal_case,
    post_reversal_case,
    reconcile_reversal_case,
    reject_reversal_case,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminReversalControlDashboardView(_AdminBase):
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        rows = list_reversal_cases(query=q, open_only=False)
        open_rows = [row for row in rows["results"] if row["status"] in {"DRAFT", "NEEDS_REVIEW", "APPROVED"}]
        return Response(
            {
                "summary": {
                    "total_cases": rows["count"],
                    "open_cases": len(open_rows),
                    "posted_cases": len([r for r in rows["results"] if r["status"] == "POSTED"]),
                    "rejected_cases": len([r for r in rows["results"] if r["status"] == "REJECTED"]),
                },
                "results": rows["results"],
            }
        )


class AdminReversalCaseListCreateView(_AdminBase):
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        open_only = (request.query_params.get("open_only") or "").strip().lower() in {"1", "true", "yes"}
        return Response(list_reversal_cases(query=q, open_only=open_only))

    def post(self, request):
        serializer = ReversalCaseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        payload["customer_id"] = payload.pop("customer_id", None)
        payload["partner_id"] = payload.pop("partner_id", None)
        payload["reversal_type"] = payload.pop("reversal_type", "MANUAL_SETTLEMENT")
        return Response(open_reversal_case(actor=request.user, payload=payload))


class AdminReversalCaseDetailView(_AdminBase):
    def get(self, request, pk: int):
        return Response(get_reversal_case(case_id=pk))


class AdminReversalCaseApproveView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(approve_reversal_case(case_id=pk, actor=request.user, reason=serializer.validated_data["reason"]))


class AdminReversalCasePostView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(post_reversal_case(case_id=pk, actor=request.user, reason=serializer.validated_data["reason"]))


class AdminReversalCaseRejectView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(reject_reversal_case(case_id=pk, actor=request.user, reason=serializer.validated_data["reason"]))


class AdminReversalCaseReconcileView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(reconcile_reversal_case(case_id=pk, actor=request.user, reason=serializer.validated_data["reason"]))


class AdminReversalReconciliationQueueView(_AdminBase):
    def get(self, request):
        rows = list_reversal_cases(query=(request.query_params.get("q") or "").strip(), open_only=False)
        pending = [
            row
            for row in rows["results"]
            if str((row.get("metadata") or {}).get("reconciliation_status") or "").upper() != "FULLY_RECONCILED"
        ]
        return Response({"count": len(pending), "results": pending})
