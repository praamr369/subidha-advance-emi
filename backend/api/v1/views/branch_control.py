from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.branch_control import (
    BranchReportingQuerySerializer,
    BranchImportActionSerializer,
    BranchSerializer,
    CashCounterSerializer,
)
from branch_control.models import Branch, BranchStatus, CashCounter
from branch_control.services.import_service import (
    post_branch_import,
    post_counter_import,
    preview_branch_import,
    preview_counter_import,
)
from branch_control.services.branch_service import build_branch_reporting_overview


class AdminBranchControlViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class BranchViewSet(AdminBranchControlViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    search_fields = ["code", "name", "phone", "email"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["-is_primary", "name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-is_primary", "name", "id")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        is_primary = (self.request.query_params.get("is_primary") or "").strip().lower()
        if status_value:
            queryset = queryset.filter(status=status_value)
        if is_primary in {"true", "false"}:
            queryset = queryset.filter(is_primary=is_primary == "true")
        return queryset


class CashCounterViewSet(AdminBranchControlViewSet):
    queryset = CashCounter.objects.select_related("branch", "finance_account", "assigned_user").all()
    serializer_class = CashCounterSerializer
    search_fields = ["code", "name", "branch__code", "branch__name", "assigned_user__username"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["branch__name", "name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get("branch")
        is_active = self.request.query_params.get("is_active")
        assigned_user_id = self.request.query_params.get("assigned_user")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=is_active == "true")
        if assigned_user_id:
            queryset = queryset.filter(assigned_user_id=assigned_user_id)
        return queryset


class BranchReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        active_branches = Branch.objects.filter(status=BranchStatus.ACTIVE).order_by("-is_primary", "name", "id")
        primary_branch = active_branches.filter(is_primary=True).first()
        active_counters = CashCounter.objects.filter(is_active=True).select_related("branch", "finance_account", "assigned_user")
        covered_branch_ids = set(active_counters.values_list("branch_id", flat=True))
        active_branch_ids = set(active_branches.values_list("id", flat=True))
        uncovered_active_branches = active_branches.exclude(id__in=covered_branch_ids)

        blockers = []
        warnings = []
        if not active_branches.exists():
            blockers.append("Create at least one active branch before shop operations.")
        if primary_branch is None:
            blockers.append("Mark exactly one active branch as the primary branch default.")
        if not active_counters.exists():
            blockers.append("Create at least one active cash counter for collections.")
        if active_branches.exists() and uncovered_active_branches.exists():
            warnings.append(f"{uncovered_active_branches.count()} active branch(es) do not yet have an active counter.")
        inactive_primary_count = Branch.objects.filter(is_primary=True).exclude(status=BranchStatus.ACTIVE).count()
        if inactive_primary_count:
            blockers.append("Inactive branch cannot remain marked as primary.")

        return Response(
            {
                "status": "READY" if not blockers else "NEEDS_SETUP",
                "blockers": blockers,
                "warnings": warnings,
                "counts": {
                    "branches_total": Branch.objects.count(),
                    "branches_active": active_branches.count(),
                    "branches_inactive": Branch.objects.filter(status=BranchStatus.INACTIVE).count(),
                    "primary_configured": primary_branch is not None,
                    "active_counters": active_counters.count(),
                    "assigned_counters": active_counters.exclude(assigned_user__isnull=True).count(),
                    "branches_with_counters": len(covered_branch_ids.intersection(active_branch_ids)),
                    "branches_without_counters": uncovered_active_branches.count(),
                },
                "primary_branch": BranchSerializer(primary_branch).data if primary_branch else None,
                "uncovered_branches": BranchSerializer(uncovered_active_branches, many=True).data,
                "actions": [
                    {"label": "Open branches", "href": "/admin/branches"},
                    {"label": "Open counters", "href": "/admin/counters"},
                    {"label": "Open branch reporting", "href": "/admin/branch-reporting"},
                    {"label": "Open finance accounts", "href": "/admin/settings/business-setup/finance-accounts"},
                ],
                "safety_note": "Branch control is additive. Existing subscription, payment, receipt, inventory, and accounting records remain authoritative; branch context is used as controlled operational trace data.",
            }
        )


class BranchReportingOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = BranchReportingQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_branch_reporting_overview(**serializer.validated_data))


class _BranchImportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = BranchImportActionSerializer

    def _uploaded_file(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        return uploaded


class BranchImportPreviewView(_BranchImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(preview_branch_import(self._uploaded_file(request)))


class BranchImportPostView(_BranchImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = post_branch_import(self._uploaded_file(request))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class CounterImportPreviewView(_BranchImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(preview_counter_import(self._uploaded_file(request)))


class CounterImportPostView(_BranchImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = post_counter_import(self._uploaded_file(request))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)
