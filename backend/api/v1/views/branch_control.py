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
from branch_control.models import Branch, CashCounter
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
    ordering = ["name", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        if status_value:
            queryset = queryset.filter(status=status_value)
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
