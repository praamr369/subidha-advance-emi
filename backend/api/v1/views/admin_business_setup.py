from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.business_setup import (
    BranchSerializer,
    BusinessProfileSerializer,
    CashDeskSerializer,
    ChartAccountSerializer,
    FinanceAccountSerializer,
    SetupChecklistSerializer,
    StaffOperationalAssignmentSerializer,
)
from subscriptions.models_business_setup import (
    Branch,
    CashDesk,
    ChartAccount,
    FinanceAccount,
    StaffOperationalAssignment,
)
from subscriptions.services.business_setup_service import (
    get_active_business_profile,
    get_reset_preview,
    upsert_business_profile,
)
from subscriptions.services.setup_checklist_service import compute_setup_checklist


class AdminBusinessSetupViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminBusinessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        profile = get_active_business_profile()
        if not profile:
            return Response({"detail": "Business profile is not configured yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BusinessProfileSerializer(profile).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial: bool):
        instance = get_active_business_profile()
        serializer = BusinessProfileSerializer(instance=instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        profile = upsert_business_profile(data=serializer.validated_data, instance=instance)
        return Response(BusinessProfileSerializer(profile).data, status=status.HTTP_200_OK)


class BranchAdminViewSet(AdminBusinessSetupViewSet):
    queryset = Branch.objects.all().order_by("name", "id")
    serializer_class = BranchSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        q = (self.request.query_params.get("q") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if q:
            queryset = queryset.filter(Q(code__icontains=q) | Q(name__icontains=q))
        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)
        return queryset.order_by("name", "id")


class FinanceAccountAdminViewSet(AdminBusinessSetupViewSet):
    queryset = FinanceAccount.objects.all().order_by("name", "id")
    serializer_class = FinanceAccountSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        account_type = (self.request.query_params.get("account_type") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if account_type:
            queryset = queryset.filter(account_type=account_type)
        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)
        return queryset


class CashDeskAdminViewSet(AdminBusinessSetupViewSet):
    queryset = CashDesk.objects.select_related("branch", "default_finance_account").all().order_by("branch__name", "name", "id")
    serializer_class = CashDeskSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        branch = (self.request.query_params.get("branch") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()
        if branch.isdigit():
            queryset = queryset.filter(branch_id=int(branch))
        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)
        return queryset


class StaffOperationalAssignmentAdminViewSet(AdminBusinessSetupViewSet):
    queryset = StaffOperationalAssignment.objects.select_related("user", "branch", "default_cash_desk").all().order_by("-created_at", "-id")
    serializer_class = StaffOperationalAssignmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        branch = (self.request.query_params.get("branch") or "").strip()
        user = (self.request.query_params.get("user") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if branch.isdigit():
            queryset = queryset.filter(branch_id=int(branch))
        if user.isdigit():
            queryset = queryset.filter(user_id=int(user))
        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)
        return queryset


class ChartAccountAdminViewSet(AdminBusinessSetupViewSet):
    queryset = ChartAccount.objects.select_related("parent").all().order_by("display_order", "code", "id")
    serializer_class = ChartAccountSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        category = (self.request.query_params.get("account_category") or "").strip()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if category:
            queryset = queryset.filter(account_category=category)
        if is_active == "true":
            queryset = queryset.filter(is_active=True)
        elif is_active == "false":
            queryset = queryset.filter(is_active=False)
        return queryset


class BusinessSetupChecklistView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = compute_setup_checklist()
        serializer = SetupChecklistSerializer(payload)
        return Response(serializer.data)


class BusinessSetupResetPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            {
                "mode": "read_only_preview",
                "business_setup_master_counts": get_reset_preview(),
            }
        )
