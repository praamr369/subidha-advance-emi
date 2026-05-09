from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.operational_cancellation import (
    ReversalCaseAssignSerializer,
    ReversalCaseCloseSerializer,
    ReversalCaseCreateSerializer,
    ReversalCaseNoteSerializer,
    ReversalCasePatchSerializer,
    ReversalCaseTransitionSerializer,
)
from accounting.services.reversal_control_service import (
    approve_reversal_case,
    archive_reversal_case,
    assign_reversal_case,
    close_reversal_case,
    get_reversal_case,
    list_reversal_cases,
    note_reversal_case,
    open_reversal_case,
    patch_reversal_case,
    post_reversal_case,
    reconcile_reversal_case,
    reject_reversal_case,
    sync_reversal_case_from_source,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminReversalControlDashboardView(_AdminBase):
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        rows = list_reversal_cases(query=q, open_only=False)
        open_rows = [row for row in rows["results"] if row["status"] in {"DRAFT", "NEEDS_REVIEW", "APPROVED", "READY"}]
        return Response(
            {
                "summary": {
                    "total_cases": rows["count"],
                    "open_cases": len(open_rows),
                    "draft_cases": len([r for r in rows["results"] if r["status"] == "DRAFT"]),
                    "posted_cases": len([r for r in rows["results"] if r["status"] == "POSTED"]),
                    "blocked_cases": len([r for r in rows["results"] if r.get("reconciliation_status") == "BLOCKED"]),
                    "ready_to_reconcile": len([r for r in rows["results"] if r.get("reconciliation_status") == "READY"]),
                    "reconciled_cases": len([r for r in rows["results"] if r.get("reconciliation_status") == "RECONCILED"]),
                    "pending_returns": len([r for r in rows["results"] if r["source_type"] in {"DIRECT_SALE_RETURN", "DIRECT_SALE"}]),
                    "pending_refunds": len([r for r in rows["results"] if r["source_type"] == "CUSTOMER_REFUND"]),
                    "receipt_voids": len([r for r in rows["results"] if r["source_type"] in {"RECEIPT", "BILLING_RECEIPT"}]),
                    "purchase_returns": len([r for r in rows["results"] if r["source_type"] == "PURCHASE_RETURN"]),
                    "manual_settlements": len([r for r in rows["results"] if r["reversal_type"] == "MANUAL_SETTLEMENT"]),
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

    def patch(self, request, pk: int):
        serializer = ReversalCasePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(patch_reversal_case(case_id=pk, actor=request.user, payload=serializer.validated_data))


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


class AdminReversalCaseSyncView(_AdminBase):
    def post(self, request, pk: int):
        return Response(sync_reversal_case_from_source(case_id=pk, actor=request.user))


class AdminReversalCaseAssignView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            assign_reversal_case(
                case_id=pk,
                actor=request.user,
                assignee_id=serializer.validated_data["assignee_id"],
                reason=serializer.validated_data["reason"],
            )
        )


class AdminReversalCaseNoteView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(note_reversal_case(case_id=pk, actor=request.user, note=serializer.validated_data["note"]))


class AdminReversalCaseCloseView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            close_reversal_case(
                case_id=pk,
                actor=request.user,
                reason=serializer.validated_data["reason"],
                override_reason=serializer.validated_data.get("override_reason", ""),
            )
        )


class AdminReversalCaseArchiveView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReversalCaseTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(archive_reversal_case(case_id=pk, actor=request.user, reason=serializer.validated_data["reason"]))


class AdminReversalReconciliationQueueView(_AdminBase):
    def get(self, request):
        rows = list_reversal_cases(query=(request.query_params.get("q") or "").strip(), open_only=False)
        pending = [row for row in rows["results"] if str(row.get("reconciliation_status") or "").upper() != "RECONCILED"]
        summary = {
            "open_cases": len([row for row in rows["results"] if row["status"] in {"DRAFT", "NEEDS_REVIEW", "APPROVED", "READY"}]),
            "draft_cases": len([row for row in rows["results"] if row["status"] == "DRAFT"]),
            "posted_cases": len([row for row in rows["results"] if row["status"] == "POSTED"]),
            "blocked_cases": len([row for row in rows["results"] if row.get("reconciliation_status") == "BLOCKED"]),
            "ready_to_reconcile": len([row for row in rows["results"] if row.get("reconciliation_status") == "READY"]),
            "reconciled_cases": len([row for row in rows["results"] if row.get("reconciliation_status") == "RECONCILED"]),
            "pending_returns": len([row for row in rows["results"] if row["source_type"] in {"DIRECT_SALE_RETURN", "DIRECT_SALE"}]),
            "pending_refunds": len([row for row in rows["results"] if row["source_type"] == "CUSTOMER_REFUND"]),
            "receipt_voids": len([row for row in rows["results"] if row["source_type"] in {"RECEIPT", "BILLING_RECEIPT"}]),
            "purchase_returns": len([row for row in rows["results"] if row["source_type"] == "PURCHASE_RETURN"]),
            "manual_settlements": len([row for row in rows["results"] if row["reversal_type"] == "MANUAL_SETTLEMENT"]),
        }
        return Response({"summary": summary, "count": len(pending), "results": pending, "filters": {"q": (request.query_params.get("q") or "").strip()}})
