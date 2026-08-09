from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory_admin import (
    AdminInventoryProfileDetailSerializer,
    AdminInventoryProfileListSerializer,
    AdminInventoryProfileUpdateSerializer,
    AdminPurchaseNeedCreateSerializer,
    AdminPurchaseNeedPatchSerializer,
    AdminPurchaseNeedSerializer,
)
from api.v1.serializers.operational_cancellation import OperationalCancellationActionSerializer
from inventory.models import InventoryItem, PurchaseNeed
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
from inventory.services.readiness_diagnostic_service import (
    get_readiness_with_dismissals,
    dismiss_warning,
    restore_warning,
)
from inventory.services.inventory_profile_service import (
    build_manufacturing_cost_profile,
    build_profile_stock_by_location,
)
from inventory.services.purchase_need_reconciliation_service import (
    parse_direct_sale_id_from_need_source,
    recheck_purchase_need_availability,
    reconcile_direct_sale_stock_requirements,
)
from inventory.services.purchase_need_list_service import build_purchase_needs_list
from inventory.services.profile_list_service import build_inventory_profiles_list, bulk_prepare_profiles
from contracts.services.operational_cancellation_service import cancel_stock_requirement
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminInventoryReadinessView(_AdminBase):
    """
    GET /admin/inventory/readiness/

    Returns inventory readiness diagnostic snapshot with dismissed warnings filtered out.
    Includes all warnings and dismissal state for full transparency.
    """

    def get(self, request):
        payload = get_readiness_with_dismissals(user=request.user)
        return Response(payload)


class AdminInventoryProfileListView(_AdminBase):
    """
    GET /admin/inventory/profiles/?page=1&page_size=50&search=product_name&stock_tracking_enabled=true

    Returns paginated inventory profiles with server-side filtering and KPI summary.
    """

    def get(self, request):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        # Get filter params
        search = (request.query_params.get("search") or "").strip()
        stock_tracking_param = (request.query_params.get("stock_tracking_enabled") or "").strip().lower()
        stock_tracking_enabled = None
        if stock_tracking_param == "true":
            stock_tracking_enabled = True
        elif stock_tracking_param == "false":
            stock_tracking_enabled = False

        # Build the profiles list with all filters
        payload = build_inventory_profiles_list(
            search=search if search else None,
            stock_tracking_enabled=stock_tracking_enabled,
            page=page,
            page_size=page_size,
        )

        return Response(payload)


class AdminInventoryProfileDetailView(_AdminBase):
    def get_object(self, pk: int) -> InventoryItem:
        return get_object_or_404(InventoryItem.objects.select_related("product"), pk=pk)

    def get(self, request, pk):
        item = self.get_object(pk)
        payload = AdminInventoryProfileDetailSerializer(item)
        return Response(payload.data)

    @transaction.atomic
    def patch(self, request, pk):
        item = self.get_object(pk)
        serializer = AdminInventoryProfileUpdateSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(AdminInventoryProfileDetailSerializer(updated).data)


class AdminInventoryProfileStockByLocationView(_AdminBase):
    def get(self, request, pk):
        item = get_object_or_404(InventoryItem.objects.select_related("product"), pk=pk)
        return Response(build_profile_stock_by_location(inventory_item=item))


class AdminInventoryProfileManufacturingCostView(_AdminBase):
    def get(self, request, pk):
        item = get_object_or_404(InventoryItem.objects.select_related("product"), pk=pk)
        return Response(build_manufacturing_cost_profile(inventory_item=item))

    @transaction.atomic
    def patch(self, request, pk):
        item = get_object_or_404(InventoryItem.objects.select_related("product"), pk=pk)
        serializer = AdminInventoryProfileUpdateSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        item.refresh_from_db()
        return Response(build_manufacturing_cost_profile(inventory_item=item))


class AdminInventoryProfileBulkPrepareView(_AdminBase):
    """
    POST /admin/inventory/profiles/bulk-prepare/

    Bulk prepare inventory profiles with standard tracking rules.
    """

    @transaction.atomic
    def post(self, request):
        item_ids = request.data.get("item_ids", [])
        default_location_id = request.data.get("default_location_id")
        reorder_level_qty = request.data.get("reorder_level_qty", "0.000")
        stock_item_type = request.data.get("stock_item_type", "FINISHED_GOOD")

        if not item_ids or not isinstance(item_ids, list):
            return Response(
                {"detail": "item_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Perform bulk prepare
        result = bulk_prepare_profiles(
            item_ids=item_ids,
            default_location_id=default_location_id,
            reorder_level_qty=reorder_level_qty,
            stock_item_type=stock_item_type,
        )

        # Log audit trail
        log_audit(
            action="BULK_PREPARE",
            actor=request.user,
            target_model="InventoryItem",
            details={
                "item_count": len(item_ids),
                "updated_count": result["updated_count"],
                "default_location_id": default_location_id,
                "reorder_level_qty": reorder_level_qty,
                "stock_item_type": stock_item_type,
            },
        )

        return Response(result)


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
        previous_status = need.status
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
        required = str(refreshed.required_quantity)
        available = str(refreshed.available_quantity)
        shortage = str(refreshed.shortage_quantity)
        new_status = refreshed.status
        resolved = (
            str(result.get("outcome") or "").strip().upper() == "RESOLVED_BY_AVAILABLE_STOCK"
            or (refreshed.shortage_quantity or 0) <= 0
        )
        return Response(
            {
                # New additive envelope (requested shape)
                "updated": bool(result.get("updated")),
                "need": AdminPurchaseNeedSerializer(refreshed).data,
                "previous_status": previous_status,
                "new_status": new_status,
                "available_quantity": f"{refreshed.available_quantity:.3f}",
                "required_quantity": f"{refreshed.required_quantity:.3f}",
                "shortage_quantity": f"{refreshed.shortage_quantity:.3f}",
                "message": (
                    "Stock requirement resolved by current available stock."
                    if resolved
                    else "Stock is still short for this requirement."
                ),
                # Backward-compatible payload used by existing UI/tests
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


class AdminPurchaseNeedsListView(_AdminBase):
    """
    GET /admin/inventory/requirements/?page=1&page_size=50&status=OPEN&source_module=DIRECT_SALE&search=customer_name

    Returns paginated purchase needs with server-side filtering, search, and KPI summary.
    """

    def get(self, request):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        # Get filter params
        status_filter = (request.query_params.get("status") or "").strip().upper()
        source_filter = (request.query_params.get("source_module") or "").strip().upper()
        search = (request.query_params.get("search") or "").strip()

        # Build the purchase needs list with all filters
        payload = build_purchase_needs_list(
            status=status_filter if status_filter else None,
            source_module=source_filter if source_filter else None,
            search=search,
            page=page,
            page_size=page_size,
        )

        return Response(payload)


class AdminPurchaseNeedsUpdateStatusView(_AdminBase):
    """
    PATCH /admin/inventory/requirements/<id>/status/

    Update the status of a purchase need (OPEN → ORDER_PLACED or DISMISSED).
    """

    @transaction.atomic
    def patch(self, request, pk):
        try:
            need = PurchaseNeed.objects.get(pk=pk)
        except PurchaseNeed.DoesNotExist:
            return Response(
                {"detail": "Purchase need not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_status = (request.data.get("status") or "").strip().upper()
        if not new_status:
            return Response(
                {"detail": "Status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate status choice
        valid_statuses = ["OPEN", "ORDER_PLACED", "DISMISSED", "RESOLVED"]
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = need.status
        need.status = new_status
        need.save()

        # Log audit trail
        log_audit(
            action="UPDATE",
            actor=request.user,
            target_model="PurchaseNeed",
            target_id=need.id,
            details={
                "need_no": need.need_no,
                "status_changed": f"{old_status} → {new_status}",
            },
        )

        return Response(
            {
                "updated": True,
                "purchase_need": {
                    "id": need.id,
                    "need_no": need.need_no,
                    "status": need.status,
                    "product_name": need.product.name if need.product else need.product_name_snapshot,
                    "customer_name": need.customer.name if need.customer else None,
                },
            }
        )


class AdminInventoryReadinessDismissView(_AdminBase):
    """
    POST /admin/inventory/readiness/dismiss/

    Dismiss a warning from the inventory readiness diagnostic.
    """

    def post(self, request):
        warning_key = (request.data.get("warning_key") or "").strip()
        category = (request.data.get("category") or "").strip()
        reason = (request.data.get("reason") or "").strip()

        if not warning_key:
            return Response(
                {"detail": "warning_key is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not category:
            category = "CONFIGURATION"  # Default category

        dismissal = dismiss_warning(
            warning_key=warning_key,
            category=category,
            user=request.user,
            reason=reason,
        )

        # Log audit trail
        log_audit(
            action="DISMISS",
            actor=request.user,
            target_model="InventoryReadinessDismissal",
            target_id=dismissal.id,
            details={
                "warning_key": warning_key,
                "category": category,
                "reason": reason,
            },
        )

        return Response(
            {
                "dismissed": True,
                "warning_key": warning_key,
                "category": category,
            }
        )


class AdminInventoryReadinessRestoreView(_AdminBase):
    """
    POST /admin/inventory/readiness/restore/

    Restore a previously dismissed warning.
    """

    def post(self, request):
        warning_key = (request.data.get("warning_key") or "").strip()

        if not warning_key:
            return Response(
                {"detail": "warning_key is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        restored = restore_warning(warning_key=warning_key)

        if not restored:
            return Response(
                {"detail": "Warning was not dismissed."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Log audit trail
        log_audit(
            action="RESTORE",
            actor=request.user,
            target_model="InventoryReadinessDismissal",
            details={"warning_key": warning_key},
        )

        return Response({"restored": True, "warning_key": warning_key})
