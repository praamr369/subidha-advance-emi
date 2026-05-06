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
from api.v1.serializers.operational_cancellation import OperationalCancellationActionSerializer
from inventory.models import PurchaseNeed
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
from inventory.services.purchase_need_reconciliation_service import (
    parse_direct_sale_id_from_need_source,
    recheck_purchase_need_availability,
    reconcile_direct_sale_stock_requirements,
)
from subscriptions.services.operational_cancellation_service import cancel_stock_requirement
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


class AdminInventoryStockNeedRecheckView(_AdminBase):
    @transaction.atomic
    def post(self, request, pk):
        need = PurchaseNeed.objects.filter(pk=pk).first()
        if need is None:
            return Response({"detail": "Stock need not found."}, status=status.HTTP_404_NOT_FOUND)
        result = recheck_purchase_need_availability(need_id=int(pk), actor=request.user)
        need.refresh_from_db()
        if need.source_module == PurchaseNeed.SourceModule.DIRECT_SALE:
            sale_id = parse_direct_sale_id_from_need_source(need.source_object_id)
            if sale_id is not None:
                reconcile_direct_sale_stock_requirements(direct_sale_id=sale_id, actor=request.user)
                try:
                    from billing.models import DirectSale
                    from billing.services.direct_sale_delivery_bridge_service import (
                        sync_direct_sale_delivery_case,
                    )

                    sale = DirectSale.objects.filter(pk=sale_id).first()
                    if sale is not None:
                        sync_direct_sale_delivery_case(sale=sale, actor=request.user)
                except Exception:
                    pass
        refreshed = PurchaseNeed.objects.get(pk=pk)
        return Response(
            {
                "recheck": result,
                "stock_requirement": AdminPurchaseNeedSerializer(refreshed).data,
            }
        )


class AdminInventoryStockNeedCancelView(_AdminBase):
    @transaction.atomic
    def post(self, request, pk):
        serializer = OperationalCancellationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = cancel_stock_requirement(
                requirement_id=int(pk),
                actor=request.user,
                reason=serializer.validated_data["reason"],
                internal_note=serializer.validated_data.get("internal_note", ""),
            )
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        need = PurchaseNeed.objects.get(pk=pk)
        return Response({"updated": True, "result": result, "stock_requirement": AdminPurchaseNeedSerializer(need).data})
