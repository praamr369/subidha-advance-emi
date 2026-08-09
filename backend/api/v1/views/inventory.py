from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Vendor
from accounts.capabilities import require_capability
from inventory.services.dashboard_service import (
    build_inventory_dashboard,
    build_critical_shortages,
    build_movement_velocity,
)
from inventory.services.bulk_operations_service import (
    bulk_update_items,
    export_items_csv,
    import_items_csv,
)
from inventory.models import (
    GoodsReceipt,
    InventoryItem,
    InventoryLot,
    PurchaseBill,
    PurchaseOrder,
    PurchaseRequest,
    StockAdjustment,
    StockLedger,
    StockLocation,
    VendorBill,
    VendorContact,
    VendorAgreement,
    VendorPayment,
)
from inventory.services.audit_service import log_inventory_event
from inventory.services.procurement_service import (
    approve_purchase_request,
    cancel_purchase_order,
    convert_purchase_request_to_po,
    post_goods_receipt,
    post_vendor_bill,
    post_vendor_payment,
)
from inventory.services.opening_stock_import_service import (
    post_opening_stock_import,
    preview_opening_stock_import,
)
from inventory.services.stock_location_service import build_stock_locations
from inventory.services.stock_service import (
    approve_stock_adjustment,
    build_stock_adjustments,
    build_stock_ledger,
    build_stock_summary,
    compute_adjustment_posting_readiness,
    post_stock_adjustment,
    set_stock_adjustment_line_unit_costs,
    UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
    UNIT_COST_REQUIRED_CODE,
)
from inventory.services.stock_reservation_list_service import build_stock_reservations_list
from inventory.services.purchase_needs_list_service import build_purchase_needs_list
from inventory.services.lot_tracking_list_service import build_lot_tracking_list, export_lots_csv
from inventory.services.stock_on_hand_service import build_stock_on_hand_summary, get_critical_shortages
from inventory.services.stock_ledger_service import build_stock_ledger_list, export_ledger_csv
from billing.services.reversal_service import _location_quantity
from subscriptions.models import AuditLog
from inventory.services.valuation_service import build_inventory_valuation
from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory import (
    EmptyInventoryActionSerializer,
    InventoryItemSerializer,
    InventoryLotSerializer,
    OpeningStockImportPostSerializer,
    OpeningStockImportPreviewSerializer,
    PurchaseBillSerializer,
    PurchaseOrderSerializer,
    PurchaseRequestSerializer,
    StockLocationSerializer,
    StockAdjustmentSerializer,
    StockLedgerSerializer,
    GoodsReceiptSerializer,
    VendorBillSerializer,
    VendorContactSerializer,
    VendorAgreementSerializer,
    VendorLiteSerializer,
    VendorPaymentSerializer,
)


class AdminInventoryModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


def _parse_bool_query(value):
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


class InventoryItemViewSet(AdminInventoryModelViewSet):
    queryset = InventoryItem.objects.select_related("product", "default_stock_location").all()
    serializer_class = InventoryItemSerializer
    search_fields = ["product__product_code", "product__name", "sku"]
    ordering_fields = ["product__name", "sku", "created_at"]
    ordering = ["product__name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = _parse_bool_query(self.request.query_params.get("is_active"))
        stock_tracking_enabled = _parse_bool_query(
            self.request.query_params.get("stock_tracking_enabled")
        )
        lot_tracking_enabled = _parse_bool_query(
            self.request.query_params.get("lot_tracking_enabled")
        )
        expiry_tracking_enabled = _parse_bool_query(
            self.request.query_params.get("expiry_tracking_enabled")
        )
        stock_item_type = (self.request.query_params.get("stock_item_type") or "").strip().upper()
        barcode_or_qr = (self.request.query_params.get("code") or "").strip()

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if stock_tracking_enabled is not None:
            queryset = queryset.filter(stock_tracking_enabled=stock_tracking_enabled)
        if lot_tracking_enabled is not None:
            queryset = queryset.filter(lot_tracking_enabled=lot_tracking_enabled)
        if expiry_tracking_enabled is not None:
            queryset = queryset.filter(expiry_tracking_enabled=expiry_tracking_enabled)
        if stock_item_type:
            queryset = queryset.filter(stock_item_type=stock_item_type)
        if barcode_or_qr:
            queryset = queryset.filter(Q(barcode__iexact=barcode_or_qr) | Q(qr_code__iexact=barcode_or_qr))

        return queryset

    def perform_create(self, serializer):
        item = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.INVENTORY_ITEM_CREATED,
            instance=item,
            performed_by=self.request.user,
            event="INVENTORY_ITEM_CREATED",
            metadata={
                "inventory_item_id": item.id,
                "product_id": item.product_id,
                "stock_item_type": item.stock_item_type,
            },
        )

    def perform_update(self, serializer):
        changed_fields = sorted(serializer.validated_data.keys())
        item = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.INVENTORY_ITEM_UPDATED,
            instance=item,
            performed_by=self.request.user,
            event="INVENTORY_ITEM_UPDATED",
            metadata={
                "inventory_item_id": item.id,
                "product_id": item.product_id,
                "changed_fields": changed_fields,
            },
        )


class InventoryLotViewSet(AdminInventoryModelViewSet):
    queryset = (
        InventoryLot.objects.select_related(
            "inventory_item",
            "inventory_item__product",
            "stock_location",
            "created_by",
        )
        .all()
    )
    serializer_class = InventoryLotSerializer
    search_fields = ["lot_code", "barcode", "qr_code", "inventory_item__sku", "inventory_item__product__name"]
    ordering_fields = ["expiry_date", "received_date", "created_at", "lot_code"]
    ordering = ["expiry_date", "lot_code", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        item_id = self.request.query_params.get("inventory_item")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        expiring = _parse_bool_query(self.request.query_params.get("expiring"))
        if item_id:
            queryset = queryset.filter(inventory_item_id=item_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if expiring is True:
            from datetime import timedelta
            from django.utils import timezone

            today = timezone.localdate()
            queryset = queryset.filter(expiry_date__isnull=False, expiry_date__lte=today + timedelta(days=30))
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        
        # Calculate summary KPIs over the entire base queryset
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.localdate()
        
        base_qs = InventoryLot.objects.all()
        active_lots = base_qs.filter(status="ACTIVE").count()
        quarantined = base_qs.filter(status="QUARANTINED").count()
        expiring = base_qs.filter(
            status="ACTIVE", 
            expiry_date__isnull=False, 
            expiry_date__lte=today + timedelta(days=30)
        ).count()
        
        if isinstance(response.data, dict):
            response.data['summary'] = {
                "active_lots": active_lots,
                "quarantined_lots": quarantined,
                "expiring_lots": expiring,
            }
        return response

    def perform_create(self, serializer):
        lot = serializer.save(created_by=self.request.user)
        log_inventory_event(
            action_type=AuditLog.ActionType.INVENTORY_ITEM_UPDATED,
            instance=lot.inventory_item,
            performed_by=self.request.user,
            event="INVENTORY_LOT_CREATED",
            metadata={
                "inventory_lot_id": lot.id,
                "inventory_item_id": lot.inventory_item_id,
                "lot_code": lot.lot_code,
                "expiry_date": lot.expiry_date.isoformat() if lot.expiry_date else None,
            },
        )

    def perform_update(self, serializer):
        changed_fields = sorted(serializer.validated_data.keys())
        lot = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.INVENTORY_ITEM_UPDATED,
            instance=lot.inventory_item,
            performed_by=self.request.user,
            event="INVENTORY_LOT_UPDATED",
            metadata={
                "inventory_lot_id": lot.id,
                "inventory_item_id": lot.inventory_item_id,
                "changed_fields": changed_fields,
            },
        )


class StockAdjustmentViewSet(AdminInventoryModelViewSet):
    queryset = (
        StockAdjustment.objects.select_related("stock_location", "created_by", "approved_by", "posted_by")
        .prefetch_related("lines", "lines__inventory_item", "lines__inventory_item__product")
        .all()
    )
    serializer_class = StockAdjustmentSerializer
    search_fields = ["adjustment_no", "reason"]
    ordering_fields = ["adjustment_date", "created_at", "adjustment_no"]
    ordering = ["-adjustment_date", "-created_at", "-id"]

    def list(self, request, *args, **kwargs):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        payload = build_stock_adjustments(
            status=request.query_params.get("status"),
            search=request.query_params.get("search") or request.query_params.get("q"),
            page=page,
            page_size=page_size,
        )
        return Response(payload)

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = (self.request.query_params.get("status") or "").strip().upper()
        branch_id = self.request.query_params.get("branch")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if branch_id:
            queryset = queryset.filter(stock_location__branch_id=branch_id)
        return queryset

    def get_serializer_class(self):
        if self.action in {"approve", "post_adjustment"}:
            return EmptyInventoryActionSerializer
        return super().get_serializer_class()

    def perform_create(self, serializer):
        adjustment = serializer.save(created_by=self.request.user)
        log_inventory_event(
            action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_CREATED,
            instance=adjustment,
            performed_by=self.request.user,
            event="STOCK_ADJUSTMENT_CREATED",
            metadata={
                "stock_adjustment_id": adjustment.id,
                "adjustment_no": adjustment.adjustment_no,
                "line_count": adjustment.lines.count(),
                "reason": adjustment.reason,
                "stock_location_id": adjustment.stock_location_id,
            },
        )

    def perform_update(self, serializer):
        changed_fields = sorted(serializer.validated_data.keys())
        adjustment = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.STOCK_ADJUSTMENT_UPDATED,
            instance=adjustment,
            performed_by=self.request.user,
            event="STOCK_ADJUSTMENT_UPDATED",
            metadata={
                "stock_adjustment_id": adjustment.id,
                "adjustment_no": adjustment.adjustment_no,
                "changed_fields": changed_fields,
                "line_count": adjustment.lines.count(),
            },
        )

    @action(detail=True, methods=["post"], url_path="approve")
    @require_capability("inventory.adjust")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            adjustment, updated = approve_stock_adjustment(
                stock_adjustment_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = StockAdjustmentSerializer(adjustment, context=self.get_serializer_context())
        return Response({"updated": updated, "stock_adjustment": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    @require_capability("inventory.adjust")
    def post_adjustment(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            adjustment, updated = post_stock_adjustment(
                stock_adjustment_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            # Missing-cost posting blocks are a controlled, structured 400 with a
            # stable code + per-line errors — never a 500, never a list failure.
            if str(exc) == UNIT_COST_REQUIRED_BEFORE_POSTING_MSG:
                blocked = StockAdjustment.objects.filter(pk=int(pk)).first()
                line_errors = (
                    compute_adjustment_posting_readiness(blocked)["line_errors"]
                    if blocked is not None
                    else []
                )
                return Response(
                    {
                        "detail": UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
                        "code": UNIT_COST_REQUIRED_CODE,
                        "line_errors": line_errors,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise ValidationError({"detail": str(exc)}) from exc
        payload = StockAdjustmentSerializer(adjustment, context=self.get_serializer_context())
        return Response({"updated": updated, "stock_adjustment": payload.data})

    @action(detail=True, methods=["post"], url_path="set-line-costs")
    @require_capability("inventory.adjust")
    def set_line_costs(self, request, pk=None):
        """Set/clear line unit costs before posting (DRAFT/APPROVED only).

        Body: {"unit_costs": {"<line_id>": "<unit_cost>" | null, ...}}.
        Only ``unit_cost_snapshot`` is touched; quantities, journals, and posted
        ledger rows are never altered.
        """
        unit_costs = request.data.get("unit_costs") or {}
        if not isinstance(unit_costs, dict):
            raise ValidationError({"detail": "unit_costs must be an object mapping line id to unit cost."})
        try:
            adjustment, updated = set_stock_adjustment_line_unit_costs(
                stock_adjustment_id=int(pk),
                unit_costs=unit_costs,
                performed_by=request.user,
            )
        except StockAdjustment.DoesNotExist:
            return Response({"detail": "Stock adjustment not found."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = StockAdjustmentSerializer(adjustment, context=self.get_serializer_context())
        return Response({"updated": updated, "stock_adjustment": payload.data})


class PurchaseBillViewSet(AdminInventoryModelViewSet):
    queryset = PurchaseBill.objects.select_related(
        "vendor",
        "finance_account",
        "posted_journal_entry",
        "stock_location",
    ).prefetch_related(
        "lines",
        "lines__inventory_item",
        "lines__inventory_item__product",
    ).all()
    serializer_class = PurchaseBillSerializer
    search_fields = ["bill_no", "vendor__name"]
    ordering_fields = ["bill_date", "created_at", "bill_no"]
    ordering = ["-bill_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        vendor_id = self.request.query_params.get("vendor")
        branch_id = self.request.query_params.get("branch")
        if status_value:
            queryset = queryset.filter(status=status_value)
        if vendor_id:
            queryset = queryset.filter(vendor_id=vendor_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class VendorContactViewSet(AdminInventoryModelViewSet):
    queryset = VendorContact.objects.select_related("vendor").all()
    serializer_class = VendorContactSerializer
    search_fields = ["name", "vendor__name", "phone", "email"]
    ordering_fields = ["vendor__name", "name", "created_at"]
    ordering = ["vendor__name", "-is_primary", "name", "id"]

    def perform_create(self, serializer):
        contact = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.VENDOR_CONTACT_CREATED,
            instance=contact,
            performed_by=self.request.user,
            event="VENDOR_CONTACT_CREATED",
            metadata={"vendor_contact_id": contact.id, "vendor_id": contact.vendor_id},
        )


class VendorAgreementViewSet(AdminInventoryModelViewSet):
    queryset = VendorAgreement.objects.select_related("vendor").all()
    serializer_class = VendorAgreementSerializer
    search_fields = ["agreement_no", "vendor__name", "payment_terms"]
    ordering_fields = ["effective_from", "created_at", "agreement_no"]
    ordering = ["-effective_from", "-created_at", "-id"]


class VendorViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Vendor.objects.all()
    serializer_class = VendorLiteSerializer

    def list(self, request, *args, **kwargs):
        rows = list(
            Vendor.objects.order_by("name", "id").values(
                "id",
                "name",
                "phone",
                "email",
                "gstin",
                "state_code",
                "state_name",
                "is_active",
            )
        )
        return Response({"count": len(rows), "results": rows})


class PurchaseOrderViewSet(AdminInventoryModelViewSet):
    queryset = PurchaseOrder.objects.select_related("vendor", "stock_location").prefetch_related(
        "lines", "lines__inventory_item", "lines__inventory_item__product"
    )
    serializer_class = PurchaseOrderSerializer
    search_fields = ["po_no", "vendor__name"]
    ordering_fields = ["po_date", "created_at", "po_no"]
    ordering = ["-po_date", "-created_at", "-id"]

    def perform_create(self, serializer):
        po = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.PURCHASE_ORDER_CREATED,
            instance=po,
            performed_by=self.request.user,
            event="PURCHASE_ORDER_CREATED",
            metadata={"purchase_order_id": po.id, "po_no": po.po_no},
        )

    def perform_update(self, serializer):
        po = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.PURCHASE_ORDER_UPDATED,
            instance=po,
            performed_by=self.request.user,
            event="PURCHASE_ORDER_UPDATED",
            metadata={"purchase_order_id": po.id, "po_no": po.po_no},
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        try:
            purchase_order, updated = cancel_purchase_order(
                purchase_order_id=int(pk),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PurchaseOrderSerializer(purchase_order, context=self.get_serializer_context())
        return Response({"updated": updated, "purchase_order": payload.data})


class PurchaseRequestViewSet(AdminInventoryModelViewSet):
    queryset = PurchaseRequest.objects.select_related("vendor", "stock_location", "requested_by").prefetch_related(
        "lines", "lines__inventory_item", "lines__inventory_item__product"
    )
    serializer_class = PurchaseRequestSerializer
    search_fields = ["request_no", "vendor__name"]
    ordering_fields = ["request_date", "created_at", "request_no"]
    ordering = ["-request_date", "-created_at", "-id"]

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        try:
            pr, updated = approve_purchase_request(purchase_request_id=int(pk), performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = PurchaseRequestSerializer(pr, context=self.get_serializer_context())
        return Response({"updated": updated, "purchase_request": payload.data})

    @action(detail=True, methods=["post"], url_path="convert-to-po")
    def convert_to_po(self, request, pk=None):
        po_date = request.data.get("po_date") or None
        expected_date = request.data.get("expected_date") or None
        try:
            po, pr = convert_purchase_request_to_po(
                purchase_request_id=int(pk),
                performed_by=request.user,
                po_date=po_date,
                expected_date=expected_date,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        from api.v1.serializers.inventory import PurchaseOrderSerializer as POSerializer
        po_payload = POSerializer(po, context=self.get_serializer_context())
        pr_payload = PurchaseRequestSerializer(pr, context=self.get_serializer_context())
        return Response({"purchase_order": po_payload.data, "purchase_request": pr_payload.data})


class GoodsReceiptViewSet(AdminInventoryModelViewSet):
    queryset = GoodsReceipt.objects.select_related("purchase_order", "purchase_order__vendor", "stock_location").prefetch_related(
        "lines", "lines__inventory_item", "lines__inventory_item__product"
    )
    serializer_class = GoodsReceiptSerializer
    search_fields = ["receipt_no", "purchase_order__po_no", "purchase_order__vendor__name"]
    ordering_fields = ["receipt_date", "created_at", "receipt_no"]
    ordering = ["-receipt_date", "-created_at", "-id"]

    def perform_create(self, serializer):
        receipt = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.GOODS_RECEIPT_CREATED,
            instance=receipt,
            performed_by=self.request.user,
            event="GOODS_RECEIPT_CREATED",
            metadata={"goods_receipt_id": receipt.id, "receipt_no": receipt.receipt_no},
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_receipt(self, request, pk=None):
        try:
            receipt, updated = post_goods_receipt(goods_receipt_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = GoodsReceiptSerializer(receipt, context=self.get_serializer_context())
        return Response({"updated": updated, "goods_receipt": payload.data})


class VendorBillViewSet(AdminInventoryModelViewSet):
    queryset = VendorBill.objects.select_related(
        "vendor", "purchase_order", "goods_receipt", "finance_account", "posted_journal_entry"
    ).prefetch_related("lines", "lines__inventory_item", "lines__inventory_item__product")
    serializer_class = VendorBillSerializer
    search_fields = ["bill_no", "vendor__name"]
    ordering_fields = ["bill_date", "created_at", "bill_no"]
    ordering = ["-bill_date", "-created_at", "-id"]

    def perform_create(self, serializer):
        bill = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.VENDOR_BILL_CREATED,
            instance=bill,
            performed_by=self.request.user,
            event="VENDOR_BILL_CREATED",
            metadata={"vendor_bill_id": bill.id, "bill_no": bill.bill_no},
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_bill(self, request, pk=None):
        try:
            bill, updated = post_vendor_bill(vendor_bill_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = VendorBillSerializer(bill, context=self.get_serializer_context())
        return Response({"updated": updated, "vendor_bill": payload.data})


class VendorPaymentViewSet(AdminInventoryModelViewSet):
    queryset = VendorPayment.objects.select_related(
        "vendor", "vendor_bill", "finance_account", "posted_journal_entry"
    ).all()
    serializer_class = VendorPaymentSerializer
    search_fields = ["payment_no", "vendor__name", "reference_no"]
    ordering_fields = ["payment_date", "created_at", "payment_no"]
    ordering = ["-payment_date", "-created_at", "-id"]

    def perform_create(self, serializer):
        payment = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.VENDOR_PAYMENT_CREATED,
            instance=payment,
            performed_by=self.request.user,
            event="VENDOR_PAYMENT_CREATED",
            metadata={"vendor_payment_id": payment.id, "payment_no": payment.payment_no},
        )

    @action(detail=True, methods=["post"], url_path="post")
    def post_payment(self, request, pk=None):
        try:
            payment, updated = post_vendor_payment(vendor_payment_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = VendorPaymentSerializer(payment, context=self.get_serializer_context())
        return Response({"updated": updated, "vendor_payment": payload.data})


class StockLocationViewSet(AdminInventoryModelViewSet):
    queryset = StockLocation.objects.all()
    serializer_class = StockLocationSerializer
    search_fields = ["code", "name"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = _parse_bool_query(self.request.query_params.get("is_active"))
        location_type = (self.request.query_params.get("location_type") or "").strip().upper()
        branch_id = self.request.query_params.get("branch")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if location_type:
            queryset = queryset.filter(location_type=location_type)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def list(self, request, *args, **kwargs):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        # Parse filters
        is_active = _parse_bool_query(request.query_params.get("is_active"))
        location_type = request.query_params.get("location_type")
        search = request.query_params.get("search") or request.query_params.get("q")

        payload = build_stock_locations(
            is_active=is_active,
            location_type=location_type,
            search=search,
            page=page,
            page_size=page_size,
        )
        return Response(payload)

    def perform_create(self, serializer):
        location = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.STOCK_LOCATION_CREATED,
            instance=location,
            performed_by=self.request.user,
            event="STOCK_LOCATION_CREATED",
            metadata={
                "stock_location_id": location.id,
                "code": location.code,
                "location_type": location.location_type,
            },
        )

    def perform_update(self, serializer):
        changed_fields = sorted(serializer.validated_data.keys())
        location = serializer.save()
        log_inventory_event(
            action_type=AuditLog.ActionType.STOCK_LOCATION_UPDATED,
            instance=location,
            performed_by=self.request.user,
            event="STOCK_LOCATION_UPDATED",
            metadata={
                "stock_location_id": location.id,
                "code": location.code,
                "changed_fields": changed_fields,
            },
        )


class StockLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = StockLedgerSerializer
    queryset = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "posted_by").all()

    def list(self, request, *args, **kwargs):
        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        payload = build_stock_ledger(
            item_id=request.query_params.get("item_id"),
            location_id=request.query_params.get("location_id"),
            start_date=request.query_params.get("start_date"),
            end_date=request.query_params.get("end_date"),
            movement_type=request.query_params.get("movement_type"),
            reference_model=request.query_params.get("reference_model"),
            branch_id=request.query_params.get("branch"),
            direct_sale_id=request.query_params.get("direct_sale"),
            direct_sale_return_id=request.query_params.get("direct_sale_return"),
            exchange_return_id=request.query_params.get("exchange"),
            purchase_return_id=request.query_params.get("purchase_return"),
            credit_note_id=request.query_params.get("credit_note"),
            search=request.query_params.get("search") or request.query_params.get("q"),
            reference_search=request.query_params.get("reference_search"),
            page=page,
            page_size=page_size,
        )
        return Response(payload)


class StockSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = build_stock_summary(
            item_id=request.query_params.get("item_id"),
            stock_item_type=request.query_params.get("stock_item_type"),
            branch_id=request.query_params.get("branch"),
        )
        return Response(payload)


class InventoryValuationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        export_format = request.query_params.get("export")

        # Parse pagination params
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 25))
            page = max(1, page)
            page_size = min(page_size, 500)  # Cap at 500
        except (ValueError, TypeError):
            page = 1
            page_size = 25

        # Parse location filter
        try:
            stock_location_id = int(request.query_params.get("stock_location_id")) if request.query_params.get("stock_location_id") else None
        except (ValueError, TypeError):
            stock_location_id = None

        if export_format == "csv":
            from inventory.services.valuation_service import build_inventory_valuation_csv
            csv_data = build_inventory_valuation_csv(
                as_of_date=request.query_params.get("as_of_date"),
                search=request.query_params.get("search") or request.query_params.get("q"),
                category=request.query_params.get("category"),
                exclude_zero=request.query_params.get("exclude_zero") == "true" or request.query_params.get("exclude_zero") == "1",
                stock_location_id=stock_location_id,
            )
            response = Response(csv_data, content_type="text/csv")
            response["Content-Disposition"] = "attachment; filename=inventory_valuation.csv"
            return response

        payload = build_inventory_valuation(
            as_of_date=request.query_params.get("as_of_date"),
            search=request.query_params.get("search") or request.query_params.get("q"),
            category=request.query_params.get("category"),
            exclude_zero=request.query_params.get("exclude_zero") == "true" or request.query_params.get("exclude_zero") == "1",
            stock_location_id=stock_location_id,
            page=page,
            page_size=page_size,
        )
        return Response(payload)


class InventoryDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        try:
            location_id = int(request.query_params.get("location_id")) if request.query_params.get("location_id") else None
        except (ValueError, TypeError):
            location_id = None

        # Get main dashboard KPIs
        kpis = build_inventory_dashboard(location_id=location_id)

        # Get critical shortages (top 5 out-of-stock items with pending orders)
        shortages = build_critical_shortages(location_id=location_id, limit=5)

        # Get movement velocity (fast movers and dead stock)
        velocity = build_movement_velocity(location_id=location_id)

        return Response({
            "kpis": kpis,
            "critical_shortages": shortages,
            "movement_velocity": velocity,
        })


class PurchasePipelineSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from inventory.services.procurement_service import build_purchase_pipeline_summary

        branch_id = request.query_params.get("branch")
        payload = build_purchase_pipeline_summary(
            branch_id=int(branch_id) if branch_id and str(branch_id).isdigit() else None,
        )
        return Response(payload)


class AdminInventoryItemSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        category = (request.query_params.get("category") or "").strip()
        subcategory = (request.query_params.get("subcategory") or "").strip()
        stock_item_type = (request.query_params.get("stock_item_type") or "").strip()
        include_locations = request.query_params.get("include_locations") == "1"

        queryset = InventoryItem.objects.select_related(
            "product", "default_stock_location"
        ).filter(is_active=True)

        if term:
            queryset = queryset.filter(
                Q(product__name__icontains=term)
                | Q(sku__icontains=term)
                | Q(product__product_code__icontains=term)
                | Q(barcode__icontains=term)
            )
        if category:
            queryset = queryset.filter(product__category__iexact=category)
        if subcategory:
            queryset = queryset.filter(product__subcategory__iexact=subcategory)
        if stock_item_type:
            queryset = queryset.filter(stock_item_type=stock_item_type)

        queryset = queryset.order_by("product__name", "id")[:40]

        locations = (
            list(StockLocation.objects.filter(is_active=True).order_by("name", "id"))
            if include_locations
            else []
        )

        rows = []
        for item in queryset:
            row = {
                "id": item.id,
                "inventory_item_id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name,
                "product_code": item.product.product_code or "",
                "sku": item.sku or "",
                "category": item.product.category or "",
                "subcategory": item.product.subcategory or "",
                "stock_item_type": item.stock_item_type,
                "unit_of_measure": item.unit_of_measure,
                "standard_unit_cost": str(item.standard_unit_cost) if item.standard_unit_cost else None,
                "barcode": item.barcode or "",
                "default_stock_location_id": item.default_stock_location_id,
                "default_stock_location_code": item.default_stock_location.code if item.default_stock_location else None,
            }
            if include_locations:
                by_location = []
                for location in locations:
                    qty = _location_quantity(inventory_item=item, stock_location=location)
                    if qty <= 0:
                        continue
                    by_location.append({
                        "stock_location_id": location.id,
                        "stock_location_name": location.name,
                        "stock_location_code": location.code,
                        "available_quantity": str(qty),
                    })
                row["available_by_location"] = by_location
            rows.append(row)

        return Response({"count": len(rows), "results": rows})


class AdminInventoryCategoriesView(APIView):
    """Returns distinct category and subcategory values for picker filter chips."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from subscriptions.models import ProductCategoryMaster, ProductSubcategoryMaster
        # Prefer master table entries; fall back to distinct raw strings on products
        cat_masters = list(
            ProductCategoryMaster.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name")
        )
        subcat_masters = list(
            ProductSubcategoryMaster.objects.filter(is_active=True)
            .select_related("category")
            .order_by("category__name", "name")
            .values("id", "name", "category__name")
        )
        # Also gather raw string values that appear on inventory items (products)
        from django.db.models import Count
        raw_cats = list(
            InventoryItem.objects.filter(is_active=True)
            .exclude(product__category="")
            .values_list("product__category", flat=True)
            .distinct()
            .order_by("product__category")
        )
        raw_subcats = list(
            InventoryItem.objects.filter(is_active=True)
            .exclude(product__subcategory="")
            .values("product__category", "product__subcategory")
            .distinct()
            .order_by("product__category", "product__subcategory")
        )
        stock_item_types = [
            {"value": "FINISHED_GOOD", "label": "Finished Good"},
            {"value": "ACCESSORY", "label": "Accessory"},
            {"value": "RAW_MATERIAL", "label": "Raw Material"},
        ]
        return Response({
            "categories": raw_cats,
            "subcategories": [{"category": r["product__category"], "subcategory": r["product__subcategory"]} for r in raw_subcats],
            "stock_item_types": stock_item_types,
        })


class AdminInventoryItemsBulkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request):
        """Bulk update inventory items."""
        try:
            item_ids = request.data.get("item_ids", [])
            updates = request.data.get("updates", {})

            if not isinstance(item_ids, list) or not item_ids:
                return Response(
                    {"detail": "item_ids must be a non-empty list"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not isinstance(updates, dict) or not updates:
                return Response(
                    {"detail": "updates must be a non-empty object"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            result = bulk_update_items(item_ids=item_ids, updates=updates)
            return Response(result)

        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class AdminInventoryItemsExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        """Export inventory items to CSV."""
        try:
            item_ids = request.query_params.getlist("item_ids")
            item_ids = [int(id) for id in item_ids if id.isdigit()] if item_ids else None
            stock_item_type = request.query_params.get("stock_item_type")
            bridge_enabled_str = request.query_params.get("bridge_enabled")
            bridge_enabled = None
            if bridge_enabled_str:
                bridge_enabled = bridge_enabled_str.lower() in ("true", "1", "yes")

            try:
                location_id = int(request.query_params.get("location_id")) if request.query_params.get("location_id") else None
            except (ValueError, TypeError):
                location_id = None

            csv_data = export_items_csv(
                item_ids=item_ids,
                stock_item_type=stock_item_type,
                bridge_enabled=bridge_enabled,
                location_id=location_id,
            )

            response = Response(csv_data, content_type="text/csv")
            response["Content-Disposition"] = "attachment; filename=inventory_items.csv"
            return response

        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class AdminInventoryItemsImportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        """Import inventory items from CSV."""
        try:
            csv_file = request.FILES.get("file")
            if not csv_file:
                return Response(
                    {"detail": "No file provided"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            csv_content = csv_file.read().decode("utf-8")
            result = import_items_csv(csv_content)
            return Response(result)

        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class AdminReturnLocationsSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        required = [
            ("RET-INSP", "Return Inspection", "WAREHOUSE"),
            ("RET-DMG", "Return Damaged", "WAREHOUSE"),
            ("RET-SVC", "Return Service", "WAREHOUSE"),
        ]
        created = []
        existing = []
        for code, name, location_type in required:
            location, was_created = StockLocation.objects.get_or_create(
                code=code,
                defaults={"name": name, "location_type": location_type, "is_active": True, "notes": "Auto-created for reversal return workflow"},
            )
            if was_created:
                created.append({"id": location.id, "code": location.code, "name": location.name})
            else:
                existing.append({"id": location.id, "code": location.code, "name": location.name})
        return Response(
            {
                "created_count": len(created),
                "existing_count": len(existing),
                "created": created,
                "existing": existing,
            }
        )


class OpeningStockImportPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = OpeningStockImportPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        payload = preview_opening_stock_import(uploaded)
        return Response(payload)


class OpeningStockImportPostView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = OpeningStockImportPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        try:
            payload = post_opening_stock_import(
                file_or_text=uploaded,
                movement_date=serializer.validated_data["as_of_date"],
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class AdminStockReservationListView(APIView):
    """
    GET /admin/inventory/reservations/?page=1&page_size=50&search=item_name&status=ACTIVE&reserved_for=SUBSCRIPTION

    Returns paginated stock reservations with server-side filtering and KPI summary.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

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
        status_filter = (request.query_params.get("status") or "").strip().upper()
        source_module = (request.query_params.get("source_module") or "").strip()

        # Build the reservations list with all filters
        payload = build_stock_reservations_list(
            search=search if search else None,
            status=status_filter if status_filter else None,
            source_module=source_module if source_module else None,
            page=page,
            page_size=page_size,
        )

        return Response(payload)


class AdminPurchaseNeedsListView(APIView):
    """
    GET /admin/inventory/requirements/?page=1&page_size=50&search=product&status=OPEN&source_module=SUBSCRIPTION_DEMAND

    Returns paginated purchase needs with server-side filtering and KPI summary.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

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
        status_filter = (request.query_params.get("status") or "").strip()
        source_module = (request.query_params.get("source_module") or "").strip()
        priority = (request.query_params.get("priority") or "").strip()

        # Build the purchase needs list with all filters
        payload = build_purchase_needs_list(
            search=search if search else "",
            status=status_filter if status_filter else "",
            source_module=source_module if source_module else "",
            priority=priority if priority else "",
            page=page,
            page_size=page_size,
        )

        return Response(payload)


class AdminLotTrackingListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        """List lots with pagination, filtering, KPI aggregation, or CSV export"""
        export_format = request.query_params.get("format", "").lower()

        # Get filter params
        search = (request.query_params.get("q") or request.query_params.get("search") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip()
        source_filter = (request.query_params.get("source") or "").strip()
        priority_filter = (request.query_params.get("priority") or "").strip()

        if export_format == "csv":
            rows = export_lots_csv(search, status_filter, source_filter)

            # Create CSV response
            import csv
            import io
            from django.http import HttpResponse

            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=[
                'Lot Code', 'Product Code', 'Product Name', 'SKU', 'Barcode',
                'Quantity', 'Reorder Point', 'Status', 'Source', 'Priority',
                'Warehouse', 'Created At'
            ])
            writer.writeheader()
            writer.writerows(rows)

            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="lots_export.csv"'
            return response

        # Default: return JSON list
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        if page_size not in {20, 50, 100}:
            page_size = 50

        payload = build_lot_tracking_list(
            search_query=search if search else "",
            status_filter=status_filter if status_filter else "",
            source_filter=source_filter if source_filter else "",
            priority_filter=priority_filter if priority_filter else "",
            page=page,
            page_size=page_size,
        )

        return Response(payload)


class AdminStockOnHandView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        """Get stock on hand summary with KPI aggregation and critical shortages"""
        filter_type = request.query_params.get("filter", "").lower()

        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        if page_size not in {20, 50, 100}:
            page_size = 50

        if filter_type == "critical":
            # Return only critical shortages (paginated)
            payload = get_critical_shortages(page=page, page_size=page_size)
        else:
            # Return full summary with critical shortages list
            payload = build_stock_on_hand_summary()

        return Response(payload)


class AdminStockLedgerListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        """List stock ledger with pagination, filtering, KPI aggregation, or CSV export"""
        export_format = request.query_params.get("format", "").lower()

        # Get filter params
        search = (request.query_params.get("q") or request.query_params.get("search") or "").strip()
        transaction_type = (request.query_params.get("transaction_type") or "").strip()
        reference_type = (request.query_params.get("reference_type") or "").strip()
        date_from = (request.query_params.get("date_from") or "").strip()
        date_to = (request.query_params.get("date_to") or "").strip()

        if export_format == "csv":
            rows = export_ledger_csv(search, transaction_type, reference_type, date_from, date_to)

            # Create CSV response
            import csv
            import io
            from django.http import HttpResponse

            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=[
                'Created', 'Product Code', 'Product Name', 'SKU', 'Barcode',
                'Transaction Type', 'Quantity', 'Reference Type', 'Reference ID',
                'Reference Display', 'Warehouse'
            ])
            writer.writeheader()
            writer.writerows(rows)

            response = HttpResponse(output.getvalue(), content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="stock_ledger_export.csv"'
            return response

        # Default: return JSON list
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        if page_size not in {20, 50, 100}:
            page_size = 50

        payload = build_stock_ledger_list(
            search_query=search if search else "",
            transaction_type_filter=transaction_type if transaction_type else "",
            reference_type_filter=reference_type if reference_type else "",
            date_from=date_from if date_from else "",
            date_to=date_to if date_to else "",
            page=page,
            page_size=page_size,
        )

        return Response(payload)
