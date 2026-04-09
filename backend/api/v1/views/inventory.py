from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.models import InventoryItem, PurchaseBill, StockAdjustment, StockLedger, StockLocation
from inventory.services.audit_service import log_inventory_event
from inventory.services.opening_stock_import_service import (
    post_opening_stock_import,
    preview_opening_stock_import,
)
from inventory.services.stock_service import (
    approve_stock_adjustment,
    build_stock_ledger,
    build_stock_summary,
    post_stock_adjustment,
)
from subscriptions.models import AuditLog
from inventory.services.valuation_service import build_inventory_valuation
from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory import (
    EmptyInventoryActionSerializer,
    InventoryItemSerializer,
    OpeningStockImportPostSerializer,
    OpeningStockImportPreviewSerializer,
    PurchaseBillSerializer,
    StockLocationSerializer,
    StockAdjustmentSerializer,
    StockLedgerSerializer,
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
        if status_filter:
            queryset = queryset.filter(status=status_filter)
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
    def post_adjustment(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            adjustment, updated = post_stock_adjustment(
                stock_adjustment_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = StockAdjustmentSerializer(adjustment, context=self.get_serializer_context())
        return Response({"updated": updated, "stock_adjustment": payload.data})


class PurchaseBillViewSet(AdminInventoryModelViewSet):
    queryset = PurchaseBill.objects.select_related("vendor", "finance_account", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = PurchaseBillSerializer
    search_fields = ["bill_no", "vendor__name"]
    ordering_fields = ["bill_date", "created_at", "bill_no"]
    ordering = ["-bill_date", "-created_at", "-id"]


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
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if location_type:
            queryset = queryset.filter(location_type=location_type)
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
        )
        return Response(payload)


class StockSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = build_stock_summary(
            item_id=request.query_params.get("item_id"),
            stock_item_type=request.query_params.get("stock_item_type"),
        )
        return Response(payload)


class InventoryValuationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = build_inventory_valuation(
            as_of_date=request.query_params.get("as_of_date"),
        )
        return Response(payload)


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
