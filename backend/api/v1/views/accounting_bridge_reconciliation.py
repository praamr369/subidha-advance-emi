from __future__ import annotations

from django.utils.dateparse import parse_date
from rest_framework import permissions
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, build_accounting_bridge_reconciliation
from accounting.services.accounting_bridge_purchase_bill_service import batch_post_bridge_candidates, batch_preview_bridge_candidates, post_bridge_candidate, preview_bridge_candidate, verify_bridge_reconciliation_item

STATUS_ALIASES = {"POSTED_UNVERIFIED", "BLOCKED", "UNSUPPORTED"}


def _row_matches_status_alias(row: dict, requested_status: str) -> bool:
    value = (requested_status or "").strip().upper()
    row_status = str(row.get("status") or "").strip().upper()
    reconciliation_state = str(row.get("reconciliation_state") or "").strip().upper()
    if value == "POSTED_UNVERIFIED":
        return reconciliation_state == "POSTED_UNVERIFIED" or bool(row.get("posted_unverified"))
    if value == "BLOCKED":
        return row_status.startswith("BLOCKED")
    if value == "UNSUPPORTED":
        return row_status == "UNSUPPORTED_SOURCE"
    return row_status == value


class BridgeCandidatePostSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True)
    confirm = serializers.BooleanField(required=False, default=False)
    confirm_text = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    posting_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=1000)

    def validate(self, attrs):
        confirmed = bool(attrs.get("confirm")) or (attrs.get("confirm_text") or "").strip().upper() in {"POST", "CONFIRM", "POST BRIDGE"}
        if not confirmed:
            raise serializers.ValidationError("Explicit confirm=true or confirm_text is required before posting.")
        attrs["confirmed"] = confirmed
        return attrs


class BridgeBatchPreviewSerializer(serializers.Serializer):
    candidate_ids = serializers.ListField(child=serializers.CharField(allow_blank=False), allow_empty=False, max_length=200)


class BridgeBatchPostSerializer(BridgeBatchPreviewSerializer):
    idempotency_keys = serializers.DictField(child=serializers.CharField(allow_blank=False), required=True)
    confirm = serializers.BooleanField(required=False, default=False)
    confirm_text = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    posting_note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=1000)

    def validate(self, attrs):
        confirmed = bool(attrs.get("confirm")) or (attrs.get("confirm_text") or "").strip().upper() in {"POST", "CONFIRM", "POST BRIDGE"}
        if not confirmed:
            raise serializers.ValidationError("Explicit confirm=true or confirm_text is required before batch posting.")
        attrs["confirmed"] = confirmed
        return attrs


class BridgeVerifySerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=1000)
    run_id = serializers.IntegerField(required=False, allow_null=True)


class AccountingBridgeReconciliationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        requested_status = (request.query_params.get("status") or "").strip().upper() or None
        service_status = None if requested_status in STATUS_ALIASES else requested_status
        filters = BridgeReconciliationFilters(
            module=(request.query_params.get("module") or "").strip() or None,
            event_key=(request.query_params.get("event_key") or "").strip() or None,
            date_from=parse_date(request.query_params.get("date_from") or ""),
            date_to=parse_date(request.query_params.get("date_to") or ""),
            status=service_status,
            customer=(request.query_params.get("customer") or "").strip() or None,
            vendor=(request.query_params.get("vendor") or "").strip() or None,
            partner=(request.query_params.get("partner") or "").strip() or None,
            financial_year=(request.query_params.get("financial_year") or "").strip() or None,
            accounting_period=(request.query_params.get("accounting_period") or "").strip() or None,
            source_type=(request.query_params.get("source_type") or "").strip() or None,
            source_model=(request.query_params.get("source_model") or "").strip() or None,
            account=(request.query_params.get("account") or "").strip() or None,
        )
        payload = build_accounting_bridge_reconciliation(filters)
        if requested_status in STATUS_ALIASES:
            payload = {**payload, "results": [row for row in payload.get("results", []) if _row_matches_status_alias(row, requested_status)]}
        return Response(payload)


class AccountingBridgeCandidatePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, candidate_id: str):
        try:
            return Response(preview_bridge_candidate(candidate_id))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)


class AccountingBridgeCandidatePostView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, candidate_id: str):
        serializer = BridgeCandidatePostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = post_bridge_candidate(candidate_id=candidate_id, idempotency_key=serializer.validated_data["idempotency_key"], confirmed=serializer.validated_data["confirmed"], posting_note=serializer.validated_data.get("posting_note") or "", actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)


class AccountingBridgeBatchPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = BridgeBatchPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(batch_preview_bridge_candidates(serializer.validated_data["candidate_ids"]))


class AccountingBridgeBatchPostView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = BridgeBatchPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(batch_post_bridge_candidates(candidate_ids=serializer.validated_data["candidate_ids"], idempotency_keys=serializer.validated_data["idempotency_keys"], confirmed=serializer.validated_data["confirmed"], posting_note=serializer.validated_data.get("posting_note") or "", actor=request.user))


class AccountingBridgeReconciliationItemVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        serializer = BridgeVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = verify_bridge_reconciliation_item(item_id=pk, actor=request.user, note=serializer.validated_data.get("note") or "", run_id=serializer.validated_data.get("run_id"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)
