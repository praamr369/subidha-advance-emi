from __future__ import annotations

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import CapabilityRequiredMixin
from inventory.models import OpeningStockEntry
from inventory.services.opening_stock_csv_bulk_service import (
    apply_bulk_opening_stock_csv,
    build_opening_stock_csv_template_bytes,
    preview_bulk_opening_stock_csv,
)
from inventory.services.opening_stock_entry_service import (
    cancel_opening_stock_entry,
    create_opening_stock_correction_adjustment,
    create_opening_stock_entry,
    post_opening_stock_entry,
    update_opening_stock_entry_draft,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.inventory import (
    OpeningStockBulkApplySerializer,
    OpeningStockCancelSerializer,
    OpeningStockCorrectionSerializer,
    OpeningStockEntrySerializer,
    OpeningStockEntryWriteSerializer,
    OpeningStockPostSerializer,
)


class AdminOpeningStockEntryViewSet(CapabilityRequiredMixin, viewsets.ModelViewSet):
    """Admin-only opening stock ledger workflow (draft → posted); corrections via stock adjustment drafts."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    required_capability_code = "inventory.opening_stock"
    http_method_names = ["get", "post", "patch", "head", "options"]

    queryset = (
        OpeningStockEntry.objects.select_related(
            "inventory_item",
            "inventory_item__product",
            "stock_location",
            "batch",
            "created_by",
            "posted_by",
            "correction_adjustment",
        )
        .all()
    )

    serializer_class = OpeningStockEntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        st = (self.request.query_params.get("status") or "").strip().upper()
        item_id = self.request.query_params.get("inventory_item")
        location_id = self.request.query_params.get("stock_location")
        sku_q = (self.request.query_params.get("sku") or "").strip()
        code_q = (self.request.query_params.get("product_code") or "").strip()
        batch_key = (self.request.query_params.get("batch_key") or "").strip()
        start = self.request.query_params.get("effective_date_from")
        end = self.request.query_params.get("effective_date_to")

        if st:
            qs = qs.filter(status=st)
        if item_id:
            qs = qs.filter(inventory_item_id=int(item_id))
        if location_id:
            qs = qs.filter(stock_location_id=int(location_id))
        if sku_q:
            qs = qs.filter(inventory_item__sku__icontains=sku_q)
        if code_q:
            qs = qs.filter(inventory_item__product__product_code__icontains=code_q)
        if batch_key:
            qs = qs.filter(batch__batch_key=batch_key)
        if start:
            qs = qs.filter(effective_date__gte=start)
        if end:
            qs = qs.filter(effective_date__lte=end)

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(inventory_item__sku__icontains=search)
                | Q(inventory_item__product__product_code__icontains=search)
                | Q(inventory_item__product__name__icontains=search)
            )
        return qs.order_by("-effective_date", "-id")

    def create(self, request, *args, **kwargs):
        serializer = OpeningStockEntryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        try:
            entry = create_opening_stock_entry(
                inventory_item_id=v["inventory_item"].pk,
                stock_location_id=v["stock_location"].pk,
                quantity=v["quantity"],
                effective_date=v["effective_date"],
                unit_cost_snapshot=v.get("unit_cost_snapshot"),
                note=v.get("note") or "",
                created_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            OpeningStockEntrySerializer(entry, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = OpeningStockEntryWriteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        kwargs_build = {}
        if "inventory_item" in v:
            kwargs_build["inventory_item_id"] = v["inventory_item"].pk
        if "stock_location" in v:
            kwargs_build["stock_location_id"] = v["stock_location"].pk
        if "quantity" in v:
            kwargs_build["quantity"] = v["quantity"]
        if "effective_date" in v:
            kwargs_build["effective_date"] = v["effective_date"]
        if "note" in v:
            kwargs_build["note"] = v["note"]
        if "unit_cost_snapshot" in v:
            kwargs_build["unit_cost_snapshot"] = v["unit_cost_snapshot"]
        try:
            entry = update_opening_stock_entry_draft(
                entry_id=instance.id,
                performed_by=request.user,
                **kwargs_build,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(OpeningStockEntrySerializer(entry, context={"request": request}).data)

    partial_update = update

    @action(detail=True, methods=["post"], url_path="post")
    def post_entry(self, request, pk=None):
        serializer = OpeningStockPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            entry, updated = post_opening_stock_entry(entry_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            {
                "updated": updated,
                "opening_stock_entry": OpeningStockEntrySerializer(
                    entry, context={"request": request}
                ).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_entry(self, request, pk=None):
        serializer = OpeningStockCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            entry = cancel_opening_stock_entry(entry_id=int(pk), performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"opening_stock_entry": OpeningStockEntrySerializer(entry).data})

    @action(detail=True, methods=["post"], url_path="correction")
    def correction(self, request, pk=None):
        serializer = OpeningStockCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        try:
            adjustment = create_opening_stock_correction_adjustment(
                entry_id=int(pk),
                reason=v["reason"],
                quantity_delta=v["quantity_delta"],
                unit_cost_snapshot=v.get("unit_cost_snapshot"),
                adjustment_date=v.get("adjustment_date"),
                created_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        from api.v1.serializers.inventory import StockAdjustmentSerializer

        return Response(
            {
                "stock_adjustment": StockAdjustmentSerializer(
                    adjustment, context={"request": request}
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminOpeningStockBulkPreviewView(CapabilityRequiredMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    required_capability_code = "inventory.opening_stock"
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        default_date = request.data.get("default_effective_date")
        parsed_default = None
        if default_date:
            from datetime import datetime

            parsed_default = datetime.strptime(str(default_date)[:10], "%Y-%m-%d").date()
        payload = preview_bulk_opening_stock_csv(uploaded, default_effective_date=parsed_default)
        return Response(payload)


class AdminOpeningStockBulkApplyView(CapabilityRequiredMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    required_capability_code = "inventory.opening_stock"
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = OpeningStockBulkApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        opts = serializer.validated_data
        try:
            summary = apply_bulk_opening_stock_csv(
                uploaded,
                performed_by=request.user,
                dry_run=opts.get("dry_run") or False,
                auto_post=opts.get("auto_post") or False,
                default_effective_date=opts.get("default_effective_date"),
                original_filename=getattr(uploaded, "name", "") or "",
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(summary, status=status.HTTP_200_OK)


class AdminOpeningStockTemplateView(CapabilityRequiredMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    required_capability_code = "inventory.opening_stock"

    def get(self, request):
        body = build_opening_stock_csv_template_bytes()
        response = HttpResponse(body, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="opening_stock_template.csv"'
        return response


class AdminOpeningStockBatchHistoryView(CapabilityRequiredMixin, APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    required_capability_code = "inventory.opening_stock"

    def get(self, request):
        from inventory.models import OpeningStockBatch

        qs = OpeningStockBatch.objects.select_related("created_by").order_by("-created_at")[:50]
        data = [
            {
                "batch_key": b.batch_key,
                "original_filename": b.original_filename,
                "created_at": b.created_at.isoformat(),
                "created_by_username": getattr(b.created_by, "username", None),
                "last_apply_summary": b.last_apply_summary,
            }
            for b in qs
        ]
        return Response({"count": len(data), "results": data})
