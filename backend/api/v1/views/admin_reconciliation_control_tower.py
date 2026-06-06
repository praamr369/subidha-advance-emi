from __future__ import annotations

from django.db.models import Count, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.reconciliation_control_tower import (
    ReconciliationItemDetailSerializer,
    ReconciliationItemSerializer,
    ReconciliationModuleSummarySerializer,
    ReconciliationReopenSerializer,
    ReconciliationResolveSerializer,
    ReconciliationRunCreateSerializer,
    ReconciliationRunSerializer,
)
from reconciliation.models import (
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationRun,
)
from reconciliation.services.reconciliation_runner import PhaseFRunRequest, start_and_run_phase_f
from reconciliation.services.resolution_service import reopen_item, resolve_item


class AdminReconciliationModulesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        run_id = request.query_params.get("run")
        run = None
        if run_id:
            run = ReconciliationRun.objects.filter(pk=run_id).first()
        if run is None:
            run = ReconciliationRun.objects.order_by("-started_at", "-id").first()
        if run is None:
            return Response({"run": None, "results": []})

        open_statuses = [
            ReconciliationItemStatus.NEEDS_REVIEW,
            ReconciliationItemStatus.MISSING_LEDGER,
            ReconciliationItemStatus.MISSING_SOURCE,
            ReconciliationItemStatus.AMOUNT_MISMATCH,
            ReconciliationItemStatus.QUANTITY_MISMATCH,
            ReconciliationItemStatus.STATUS_MISMATCH,
            ReconciliationItemStatus.DUPLICATE_POSTING,
            ReconciliationItemStatus.WRONG_ACCOUNT,
            ReconciliationItemStatus.MATCHED,
        ]

        queryset = (
            ReconciliationItem.objects.filter(run=run)
            .values("module")
            .annotate(
                open_count=Count("id", filter=Q(status__in=open_statuses)),
                high_risk_count=Count("id", filter=Q(severity__in={"HIGH", "CRITICAL"}) & Q(status__in=open_statuses)),
            )
            .order_by("module")
        )
        payload = []
        for row in queryset:
            exception_codes = (
                ReconciliationItem.objects.filter(run=run, module=row["module"])
                .exclude(exception_code="")
                .values("exception_code")
                .annotate(count=Count("id"))
                .order_by("exception_code")[:10]
            )
            payload.append({"module": row["module"], "open_count": row["open_count"], "high_risk_count": row["high_risk_count"], "exception_codes": list(exception_codes)})
        serializer = ReconciliationModuleSummarySerializer(payload, many=True)
        return Response({"run": ReconciliationRunSerializer(run).data, "results": serializer.data})


class AdminReconciliationRunListCreateView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = ReconciliationRunSerializer
    queryset = ReconciliationRun.objects.select_related("started_by", "branch").all().order_by("-started_at", "-id")

    def post(self, request, *args, **kwargs):
        serializer = ReconciliationRunCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        run = start_and_run_phase_f(
            request=PhaseFRunRequest(
                scope=validated.get("scope") or "PHASE_F",
                module=validated.get("module") or "CONTROL_TOWER",
                branch_id=validated.get("branch_id"),
                date_from=validated.get("date_from"),
                date_to=validated.get("date_to"),
                financial_year=validated.get("financial_year") or None,
                accounting_period=validated.get("accounting_period") or None,
            ),
            started_by=request.user,
        )
        return Response(ReconciliationRunSerializer(run).data, status=status.HTTP_201_CREATED)


class AdminReconciliationRunDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = ReconciliationRunSerializer
    queryset = ReconciliationRun.objects.select_related("started_by", "branch").all()


class AdminReconciliationItemListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = ReconciliationItemSerializer

    def get_queryset(self):
        queryset = ReconciliationItem.objects.select_related("run", "assigned_to", "resolved_by").all().order_by("-created_at", "-id")
        run_id = self.request.query_params.get("run")
        module = (self.request.query_params.get("module") or "").strip()
        status_filter = (self.request.query_params.get("status") or "").strip()
        severity = (self.request.query_params.get("severity") or "").strip()
        exception_code = (self.request.query_params.get("exception_code") or "").strip()
        search = (self.request.query_params.get("search") or "").strip()
        if run_id:
            queryset = queryset.filter(run_id=run_id)
        if module:
            queryset = queryset.filter(module=module)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if severity:
            queryset = queryset.filter(severity=severity)
        if exception_code:
            queryset = queryset.filter(exception_code=exception_code)
        if search:
            queryset = queryset.filter(Q(source_label__icontains=search) | Q(source_id__icontains=search) | Q(exception_code__icontains=search) | Q(exception_message__icontains=search))
        return queryset


class AdminReconciliationItemDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    serializer_class = ReconciliationItemDetailSerializer
    queryset = ReconciliationItem.objects.select_related("run", "assigned_to", "resolved_by").prefetch_related("evidence", "resolutions__resolved_by").all()


class AdminReconciliationItemResolveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int, *args, **kwargs):
        serializer = ReconciliationResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = resolve_item(item_id=pk, action=serializer.validated_data["action"], note=serializer.validated_data["note"], actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReconciliationItemDetailSerializer(item).data, status=status.HTTP_200_OK)


class AdminReconciliationItemReopenView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int, *args, **kwargs):
        serializer = ReconciliationReopenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = reopen_item(item_id=pk, note=serializer.validated_data["note"], actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ReconciliationItemDetailSerializer(item).data, status=status.HTTP_200_OK)
