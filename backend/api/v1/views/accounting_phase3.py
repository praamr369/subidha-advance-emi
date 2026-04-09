from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    Asset,
    AssetCategory,
    DepreciationRun,
    PostingLock,
    VendorSettlement,
)
from accounting.services.bridge_run_service import (
    run_commission_settlement_bridges,
    run_emi_payment_bridges,
    run_emi_subscription_bridges,
    run_emi_waiver_bridges,
    run_inventory_posting_bridges,
    run_payout_batch_bridges,
    run_retail_sale_bridges,
)
from accounting.services.master_import_service import (
    post_chart_of_accounts_import,
    post_vendor_import,
    preview_chart_of_accounts_import,
    preview_vendor_import,
)
from accounting.services.depreciation_service import (
    cancel_depreciation_run,
    post_depreciation_run,
    run_depreciation,
)
from accounting.services.period_service import (
    create_posting_lock,
    lock_accounting_period,
    remove_posting_lock,
    unlock_accounting_period,
)
from accounting.services.purchase_bill_posting_service import (
    approve_purchase_bill,
    cancel_purchase_bill,
    post_purchase_bill_from_accounting,
)
from accounting.services.reporting_service import (
    build_finance_book,
    build_purchase_book,
    build_sales_book,
)
from accounting.services.vendor_settlement_service import (
    cancel_vendor_settlement,
    post_vendor_settlement,
)
from inventory.models import PurchaseBill
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import (
    AccountingBridgePostingSerializer,
    AccountingBookQuerySerializer,
    AccountingPeriodSerializer,
    AssetCategorySerializer,
    AssetSerializer,
    DepreciationRunSerializer,
    MasterImportActionSerializer,
    PostingLockSerializer,
    PeriodActionSerializer,
    Phase3BridgeRunSerializer,
    VendorSettlementSerializer,
)
from api.v1.serializers.inventory import PurchaseBillSerializer


class AdminAccountingPhase3ViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class AccountingPeriodViewSet(AdminAccountingPhase3ViewSet):
    queryset = AccountingPeriod.objects.select_related("locked_by").all()
    serializer_class = AccountingPeriodSerializer
    search_fields = ["code", "label"]
    ordering_fields = ["start_date", "end_date", "code"]
    ordering = ["-start_date", "-id"]

    def get_serializer_class(self):
        if self.action in {"lock_period", "unlock_period", "close_period", "reopen_period"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="lock")
    def lock_period(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period, updated = lock_accounting_period(
            period_id=int(pk),
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        return Response({"updated": updated, "period": payload.data})

    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock_period(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period, updated = unlock_accounting_period(
            period_id=int(pk),
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        return Response({"updated": updated, "period": payload.data})

    @action(detail=True, methods=["post"], url_path="close")
    def close_period(self, request, pk=None):
        return self.lock_period(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen_period(self, request, pk=None):
        return self.unlock_period(request, pk=pk)


class PostingLockViewSet(AdminAccountingPhase3ViewSet):
    queryset = PostingLock.objects.select_related("locked_by").all()
    serializer_class = PostingLockSerializer
    search_fields = ["reason", "locked_by__username"]
    ordering_fields = ["lock_date", "locked_at", "created_at"]
    ordering = ["-lock_date", "-id"]

    def perform_create(self, serializer):
        posting_lock, created = create_posting_lock(
            lock_date=serializer.validated_data["lock_date"],
            performed_by=self.request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        if not created:
            raise ValidationError({"detail": "Posting lock already exists for this date."})
        serializer.instance = posting_lock

    def destroy(self, request, *args, **kwargs):
        posting_lock, _ = remove_posting_lock(
            posting_lock_id=int(kwargs["pk"]),
            performed_by=request.user,
        )
        payload = PostingLockSerializer(posting_lock, context=self.get_serializer_context())
        return Response(payload.data, status=status.HTTP_200_OK)


class AccountingBridgePostingViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = AccountingBridgePosting.objects.select_related("journal_entry").all()
    serializer_class = AccountingBridgePostingSerializer
    search_fields = ["source_model", "source_id", "purpose", "journal_entry__entry_no"]
    ordering_fields = ["created_at", "purpose", "source_model"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        purpose = self.request.query_params.get("purpose")
        source_model = self.request.query_params.get("source_model")
        source_id = self.request.query_params.get("source_id")
        source_type = self.request.query_params.get("source_type")
        voucher_type = self.request.query_params.get("voucher_type")
        if purpose:
            queryset = queryset.filter(purpose=purpose.strip().upper())
        if source_model:
            queryset = queryset.filter(source_model=source_model.strip())
        if source_id:
            queryset = queryset.filter(source_id=source_id.strip())
        if source_type:
            queryset = queryset.filter(source_type=source_type.strip().upper())
        if voucher_type:
            queryset = queryset.filter(voucher_type=voucher_type.strip().upper())
        return queryset


class AssetCategoryViewSet(AdminAccountingPhase3ViewSet):
    queryset = AssetCategory.objects.all()
    serializer_class = AssetCategorySerializer
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code", "id"]


class AssetViewSet(AdminAccountingPhase3ViewSet):
    queryset = Asset.objects.select_related("category", "vendor", "purchase_bill").all()
    serializer_class = AssetSerializer
    search_fields = ["asset_code", "description", "vendor__name"]
    ordering_fields = ["asset_code", "in_service_date", "acquisition_date", "created_at"]
    ordering = ["asset_code", "id"]


class DepreciationRunViewSet(AdminAccountingPhase3ViewSet):
    queryset = DepreciationRun.objects.select_related("created_by").prefetch_related("lines", "lines__asset").all()
    serializer_class = DepreciationRunSerializer
    search_fields = ["run_code", "created_by__username"]
    ordering_fields = ["period_start", "period_end", "created_at"]
    ordering = ["-period_end", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"run", "post_run", "cancel"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="run")
    def run(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run_obj, updated = run_depreciation(run_id=int(pk), performed_by=request.user)
        payload = DepreciationRunSerializer(run_obj, context=self.get_serializer_context())
        return Response({"updated": updated, "depreciation_run": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_run(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run_obj, updated = post_depreciation_run(run_id=int(pk), posted_by=request.user)
        payload = DepreciationRunSerializer(run_obj, context=self.get_serializer_context())
        return Response({"updated": updated, "depreciation_run": payload.data})

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run_obj, updated = cancel_depreciation_run(
            run_id=int(pk),
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = DepreciationRunSerializer(run_obj, context=self.get_serializer_context())
        return Response({"updated": updated, "depreciation_run": payload.data})


class AccountingPurchaseBillViewSet(AdminAccountingPhase3ViewSet):
    queryset = PurchaseBill.objects.select_related("vendor", "finance_account", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = PurchaseBillSerializer
    search_fields = ["bill_no", "vendor__name"]
    ordering_fields = ["bill_date", "created_at", "bill_no"]
    ordering = ["-bill_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_bill", "cancel"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase_bill, updated = approve_purchase_bill(
            purchase_bill_id=int(pk),
            approved_by=request.user,
        )
        payload = PurchaseBillSerializer(purchase_bill, context=self.get_serializer_context())
        return Response({"updated": updated, "purchase_bill": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_bill(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase_bill, updated = post_purchase_bill_from_accounting(
            purchase_bill_id=int(pk),
            posted_by=request.user,
        )
        payload = PurchaseBillSerializer(purchase_bill, context=self.get_serializer_context())
        return Response({"updated": updated, "purchase_bill": payload.data})

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase_bill, updated = cancel_purchase_bill(
            purchase_bill_id=int(pk),
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = PurchaseBillSerializer(purchase_bill, context=self.get_serializer_context())
        return Response({"updated": updated, "purchase_bill": payload.data})


class VendorSettlementViewSet(AdminAccountingPhase3ViewSet):
    queryset = VendorSettlement.objects.select_related(
        "vendor",
        "finance_account",
        "purchase_bill",
        "posted_journal_entry",
    ).all()
    serializer_class = VendorSettlementSerializer
    search_fields = ["settlement_no", "vendor__name", "reference_no"]
    ordering_fields = ["settlement_date", "created_at", "settlement_no"]
    ordering = ["-settlement_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"post_settlement", "cancel"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="post")
    def post_settlement(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settlement, updated = post_vendor_settlement(
            vendor_settlement_id=int(pk),
            posted_by=request.user,
        )
        payload = VendorSettlementSerializer(settlement, context=self.get_serializer_context())
        return Response({"updated": updated, "vendor_settlement": payload.data})

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settlement, updated = cancel_vendor_settlement(
            vendor_settlement_id=int(pk),
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = VendorSettlementSerializer(settlement, context=self.get_serializer_context())
        return Response({"updated": updated, "vendor_settlement": payload.data})


class AdminAccountingPhase3ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class CashBookView(AdminAccountingPhase3ReportView):
    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_finance_book(kinds=["CASH"], **serializer.validated_data))


class BankBookView(AdminAccountingPhase3ReportView):
    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_finance_book(kinds=["BANK"], **serializer.validated_data))


class UpiBookView(AdminAccountingPhase3ReportView):
    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_finance_book(kinds=["UPI"], **serializer.validated_data))


class SalesBookView(AdminAccountingPhase3ReportView):
    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_sales_book(**serializer.validated_data))


class PurchaseBookView(AdminAccountingPhase3ReportView):
    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_purchase_book(**serializer.validated_data))


class _AccountingImportView(AdminAccountingPhase3ReportView):
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = MasterImportActionSerializer

    def _uploaded_file(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            raise ValidationError({"file": "CSV file is required."})
        return uploaded


class ChartOfAccountsImportPreviewView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(preview_chart_of_accounts_import(self._uploaded_file(request)))


class ChartOfAccountsImportPostView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = post_chart_of_accounts_import(
                self._uploaded_file(request),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class VendorImportPreviewView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(preview_vendor_import(self._uploaded_file(request)))


class VendorImportPostView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = post_vendor_import(
                self._uploaded_file(request),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class _BridgeRunView(AdminAccountingPhase3ReportView):
    service = None

    def post(self, request):
        serializer = Phase3BridgeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = self.service(
                performed_by=request.user,
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class RetailSaleBridgeRunView(_BridgeRunView):
    service = staticmethod(run_retail_sale_bridges)


class InventoryBridgeRunView(_BridgeRunView):
    service = staticmethod(run_inventory_posting_bridges)


class EmiSubscriptionBridgeRunView(_BridgeRunView):
    service = staticmethod(run_emi_subscription_bridges)


class EmiPaymentBridgeRunView(_BridgeRunView):
    service = staticmethod(run_emi_payment_bridges)


class EmiWaiverBridgeRunView(_BridgeRunView):
    service = staticmethod(run_emi_waiver_bridges)


class CommissionSettlementBridgeRunView(_BridgeRunView):
    service = staticmethod(run_commission_settlement_bridges)


class PayoutBatchBridgeRunView(_BridgeRunView):
    service = staticmethod(run_payout_batch_bridges)
