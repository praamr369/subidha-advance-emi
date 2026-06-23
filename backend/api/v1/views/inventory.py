from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Vendor
from accounts.capabilities import require_capability
from inventory.models import (
    GoodsReceipt,
    InventoryItem,
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
from inventory.services.stock_service import (
    approve_stock_adjustment,
    build_stock_ledger,
    build_stock_summary,
    compute_adjustment_posting_readiness,
    post_stock_adjustment,
    set_stock_adjustment_line_unit_costs,
    UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
    UNIT_COST_REQUIRED_CODE,
)
from billing.services.reversal_service import _location_quantity
from subscriptions.models import AuditLog
from inventory.services.valuation_service import build_inventory_valuation
from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory import (
    EmptyInventoryActionSerializer,
    InventoryItemSerializer,
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
        stock_item_type = (self.request.query_params.get("stock_item_type") or "").strip().upper()

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if stock_tracking_enabled is not None:
            queryset = queryset.filter(stock_tracking_enabled=stock_tracking_enabled)
        if stock_item_type:
            queryset = queryset.filter(stock_item_type=stock_item_type)

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
        payload = build_inventory_valuation(
            as_of_date=request.query_params.get("as_of_date"),
        )
        return Response(payload)


class AdminInventoryItemSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        queryset = InventoryItem.objects.select_related("product", "default_stock_location").filter(is_active=True)
        if term:
            queryset = queryset.filter(
                Q(product__name__icontains=term)
                | Q(sku__icontains=term)
                | Q(product__product_code__icontains=term)
            )
        queryset = queryset.order_by("product__name", "id")[:30]
        rows = []
        locations = list(StockLocation.objects.filter(is_active=True).order_by("name", "id"))
        for item in queryset:
            by_location = []
            for location in locations:
                qty = _location_quantity(inventory_item=item, stock_location=location)
                if qty <= 0:
                    continue
                by_location.append(
                    {
                        "stock_location_id": location.id,
                        "stock_location_name": location.name,
                        "stock_location_code": location.code,
                        "available_quantity": str(qty),
                    }
                )
            rows.append(
                {
                    "id": item.id,
                    "inventory_item_id": item.id,
                    "product_id": item.product_id,
                    "product_name": item.product.name,
                    "sku": item.sku or "",
                    "default_stock_location_id": item.default_stock_location_id,
                    "available_by_location": by_location,
                }
            )
        return Response({"count": len(rows), "results": rows})


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
