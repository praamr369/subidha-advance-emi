from __future__ import annotations

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.manufacturing import (
    ManufacturingBomSerializer,
    ManufacturingEmptyActionSerializer,
    ProductionCancelSerializer,
    ProductionJobSerializer,
    ProductionMaterialPostSerializer,
    ProductionOutputPostSerializer,
    run_bom_activate,
    run_bom_deactivate,
    run_job_complete,
    run_job_release,
)
from manufacturing.models import ManufacturingBom, ProductionJob
from manufacturing.services.production_service import build_manufacturing_overview


class AdminManufacturingModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class ManufacturingOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_manufacturing_overview())


class ManufacturingBomViewSet(AdminManufacturingModelViewSet):
    queryset = ManufacturingBom.objects.select_related(
        "finished_good_inventory_item",
        "finished_good_inventory_item__product",
        "activated_by",
    ).prefetch_related(
        "lines",
        "lines__inventory_item",
        "lines__inventory_item__product",
    ).all()
    serializer_class = ManufacturingBomSerializer
    search_fields = ["bom_no", "finished_good_inventory_item__sku", "finished_good_inventory_item__product__name"]
    ordering_fields = ["bom_no", "revision_no", "updated_at"]
    ordering = ["finished_good_inventory_item__product__name", "-revision_no", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        finished_good = self.request.query_params.get("finished_good_inventory_item")
        is_default = self.request.query_params.get("is_default")
        if status_value:
            queryset = queryset.filter(status=status_value)
        if finished_good:
            queryset = queryset.filter(finished_good_inventory_item_id=finished_good)
        if is_default is not None:
            queryset = queryset.filter(is_default=is_default in {"1", "true", "TRUE", "yes", "YES"})
        return queryset

    def get_serializer_class(self):
        if self.action in {"activate", "deactivate"}:
            return ManufacturingEmptyActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_bom_activate(bom=self.get_object(), request=request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ManufacturingBomSerializer(result["bom"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "bom": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_bom_deactivate(bom=self.get_object(), request=request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ManufacturingBomSerializer(result["bom"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "bom": payload.data}, status=status.HTTP_200_OK)


class ProductionJobViewSet(AdminManufacturingModelViewSet):
    queryset = ProductionJob.objects.select_related(
        "bom",
        "finished_good_inventory_item",
        "finished_good_inventory_item__product",
        "stock_location",
        "created_by",
        "released_by",
        "completed_by",
        "cancelled_by",
    ).prefetch_related(
        "material_issue_lines",
        "material_issue_lines__inventory_item",
        "material_issue_lines__inventory_item__product",
        "receipt_lines",
        "receipt_lines__inventory_item",
        "receipt_lines__inventory_item__product",
        "scrap_lines",
        "scrap_lines__inventory_item",
        "scrap_lines__inventory_item__product",
    ).all()
    serializer_class = ProductionJobSerializer
    search_fields = ["job_no", "finished_good_inventory_item__sku", "finished_good_inventory_item__product__name"]
    ordering_fields = ["job_date", "created_at", "job_no"]
    ordering = ["-job_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        finished_good = self.request.query_params.get("finished_good_inventory_item")
        bom_id = self.request.query_params.get("bom")
        accounting_status = (self.request.query_params.get("accounting_status") or "").strip().upper()
        costing_status = (self.request.query_params.get("costing_status") or "").strip().upper()
        if status_value:
            queryset = queryset.filter(status=status_value)
        if finished_good:
            queryset = queryset.filter(finished_good_inventory_item_id=finished_good)
        if bom_id:
            queryset = queryset.filter(bom_id=bom_id)
        if accounting_status:
            queryset = queryset.filter(accounting_status=accounting_status)
        if costing_status:
            queryset = queryset.filter(costing_status=costing_status)
        return queryset

    def get_serializer_class(self):
        if self.action in {"release", "complete"}:
            return ManufacturingEmptyActionSerializer
        if self.action == "post_materials":
            return ProductionMaterialPostSerializer
        if self.action == "post_output":
            return ProductionOutputPostSerializer
        if self.action == "cancel_job":
            return ProductionCancelSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="release")
    def release(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_job_release(job=self.get_object(), request=request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ProductionJobSerializer(result["job"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "job": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="post-materials")
    def post_materials(self, request, pk=None):
        job = self.get_object()
        serializer = self.get_serializer(data=request.data, context={"job": job, "request": request})
        serializer.is_valid(raise_exception=True)
        try:
            updated_job = serializer.save()
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ProductionJobSerializer(updated_job, context=self.get_serializer_context())
        return Response({"updated": True, "job": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="post-output")
    def post_output(self, request, pk=None):
        job = self.get_object()
        serializer = self.get_serializer(data=request.data, context={"job": job, "request": request})
        serializer.is_valid(raise_exception=True)
        try:
            updated_job = serializer.save()
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ProductionJobSerializer(updated_job, context=self.get_serializer_context())
        return Response({"updated": True, "job": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_job_complete(job=self.get_object(), request=request)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ProductionJobSerializer(result["job"], context=self.get_serializer_context())
        return Response({"updated": result["updated"], "job": payload.data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_job(self, request, pk=None):
        job = self.get_object()
        serializer = self.get_serializer(data=request.data, context={"job": job, "request": request})
        serializer.is_valid(raise_exception=True)
        try:
            updated_job = serializer.save()
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ProductionJobSerializer(updated_job, context=self.get_serializer_context())
        return Response({"updated": True, "job": payload.data}, status=status.HTTP_200_OK)
