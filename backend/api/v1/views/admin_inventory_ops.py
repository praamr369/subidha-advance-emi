from __future__ import annotations

from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory_admin import (
    AdminPurchaseNeedCreateSerializer,
    AdminPurchaseNeedPatchSerializer,
    AdminPurchaseNeedSerializer,
)
from inventory.models import PurchaseNeed
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminInventoryReadinessView(_AdminBase):
    def get(self, request):
        payload = get_inventory_readiness_snapshot()
        return Response(payload)


class AdminInventoryStockNeedListCreateView(_AdminBase):
    def get(self, request):
        qs = PurchaseNeed.objects.select_related(
            "product",
            "warehouse",
            "branch",
            "customer",
            "created_by",
        ).order_by("-created_at", "-id")
        st = (request.query_params.get("status") or "").strip().upper()
        if st:
            qs = qs.filter(status=st)
        src = (request.query_params.get("source_module") or "").strip().upper()
        if src:
            qs = qs.filter(source_module=src)
        try:
            limit = min(max(int(request.query_params.get("limit", "50")), 1), 200)
        except ValueError:
            limit = 50
        sliced = qs[:limit]
        return Response(
            {
                "count": qs.count(),
                "results": AdminPurchaseNeedSerializer(sliced, many=True).data,
            }
        )

    @transaction.atomic
    def post(self, request):
        serializer = AdminPurchaseNeedCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        need = serializer.save()
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=need,
            performed_by=request.user,
            metadata={"event": "STOCK_NEED_CREATED", "purchase_need_id": need.id, "need_no": need.need_no},
        )
        return Response(AdminPurchaseNeedSerializer(need).data, status=status.HTTP_201_CREATED)


class AdminInventoryStockNeedPatchView(_AdminBase):
    @transaction.atomic
    def patch(self, request, pk):
        need = PurchaseNeed.objects.filter(pk=pk).first()
        if need is None:
            raise serializers.ValidationError({"detail": "Stock need not found."})
        serializer = AdminPurchaseNeedPatchSerializer(need, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=updated,
            performed_by=request.user,
            metadata={
                "event": "STOCK_NEED_UPDATED",
                "purchase_need_id": updated.id,
                "need_no": updated.need_no,
                "status": updated.status,
            },
        )
        return Response(AdminPurchaseNeedSerializer(updated).data)
