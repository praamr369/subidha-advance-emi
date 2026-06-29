from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    AccountingPeriodStatus,
    Asset,
    AssetCategory,
    DepreciationRun,
    FinancialYear,
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
    post_employee_import,
    post_vendor_import,
    preview_chart_of_accounts_import,
    preview_employee_import,
    preview_vendor_import,
)
from accounting.services.depreciation_service import (
    cancel_depreciation_run,
    post_depreciation_run,
    run_depreciation,
)
from accounting.services.period_service import (
    activate_financial_year,
    build_accounting_period_readiness,
    create_posting_lock,
    generate_monthly_periods,
    lock_accounting_period,
    remove_posting_lock,
    set_accounting_period_status,
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
from api.v1.pagination import AdminAccountingPagination
from api.v1.serializers.accounting_phase3 import (
    AccountingBridgePostingSerializer,
    AccountingBookQuerySerializer,
    AccountingPeriodSerializer,
    AssetCategorySerializer,
    AssetSerializer,
    DepreciationRunSerializer,
    FinancialYearSerializer,
    MasterImportActionSerializer,
    PostingLockSerializer,
    PeriodActionSerializer,
    PeriodStatusActionSerializer,
    Phase3BridgeRunSerializer,
    VendorSettlementSerializer,
)
from api.v1.serializers.inventory import PurchaseBillSerializer


class AdminAccountingPhase3ViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class FinancialYearViewSet(AdminAccountingPhase3ViewSet):
    queryset = FinancialYear.objects.select_related("activated_by").all()
    serializer_class = FinancialYearSerializer
    search_fields = ["code", "name"]
    ordering_fields = ["start_date", "end_date", "code", "is_active"]
    ordering = ["-start_date", "-id"]

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        financial_year = activate_financial_year(financial_year_id=int(pk), performed_by=request.user)
        payload = FinancialYearSerializer(financial_year, context=self.get_serializer_context())
        return Response({"updated": True, "financial_year": payload.data})

    @action(detail=True, methods=["post"], url_path="generate-periods")
    def generate_periods(self, request, pk=None):
        result = generate_monthly_periods(financial_year_id=int(pk), performed_by=request.user)
        period_payload = AccountingPeriodSerializer(
            result["periods"],
            many=True,
            context=self.get_serializer_context(),
        )
        fy_payload = FinancialYearSerializer(result["financial_year"], context=self.get_serializer_context())
        return Response(
            {
                "updated": result["created_count"] > 0,
                "created_count": result["created_count"],
                "financial_year": fy_payload.data,
                "periods": period_payload.data,
            }
        )


class AccountingPeriodViewSet(AdminAccountingPhase3ViewSet):
    queryset = AccountingPeriod.objects.select_related("financial_year", "locked_by").all()
    serializer_class = AccountingPeriodSerializer
    search_fields = ["code", "label", "name", "financial_year__code"]
    ordering_fields = ["start_date", "end_date", "code", "status"]
    ordering = ["-start_date", "-id"]

    def get_serializer_class(self):
        if self.action == "status_period":
            return PeriodStatusActionSerializer
        if self.action in {"lock_period", "unlock_period", "close_period", "reopen_period"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=False, methods=["get"], url_path="readiness")
    def readiness(self, request):
        readiness = build_accounting_period_readiness()
        fy_payload = (
            FinancialYearSerializer(readiness["active_financial_year"], context=self.get_serializer_context()).data
            if readiness["active_financial_year"] is not None
            else None
        )
        period_payload = (
            AccountingPeriodSerializer(readiness["current_period"], context=self.get_serializer_context()).data
            if readiness["current_period"] is not None
            else None
        )
        lock_payload = (
            PostingLockSerializer(readiness["posting_lock"], context=self.get_serializer_context()).data
            if readiness["posting_lock"] is not None
            else None
        )
        return Response(
            {
                "reference_date": readiness["reference_date"],
                "active_financial_year": fy_payload,
                "current_period": period_payload,
                "posting_lock": lock_payload,
                "is_ready": readiness["is_ready"],
                "errors": readiness["errors"],
                "warnings": readiness["warnings"],
            }
        )

    @action(detail=True, methods=["post"], url_path="status")
    def status_period(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            period, updated = set_accounting_period_status(
                period_id=int(pk),
                status=serializer.validated_data["status"],
                performed_by=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        return Response({"updated": updated, "period": payload.data})

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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period, updated = set_accounting_period_status(
            period_id=int(pk),
            status=AccountingPeriodStatus.CLOSED,
            performed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        return Response({"updated": updated, "period": payload.data})

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen_period(self, request, pk=None):
        return self.unlock_period(request, pk=pk)

    @action(detail=False, methods=["post"], url_path="bulk-lock-open")
    def bulk_lock_open(self, request):
        """Lock all OPEN periods in the active financial year (or all years if no active FY).
        Skips the period that covers today by default (exclude_current_period=true).
        Returns count locked and any per-period errors."""
        from django.utils import timezone
        reason = (request.data or {}).get("reason", "Bulk lock from admin accounting cockpit.")
        exclude_current = (request.data or {}).get("exclude_current_period", True)
        qs = AccountingPeriod.objects.select_related("financial_year").filter(
            status=AccountingPeriodStatus.OPEN
        )
        financial_year_id = (request.data or {}).get("financial_year_id")
        if financial_year_id:
            qs = qs.filter(financial_year_id=int(financial_year_id))
        today = timezone.localdate()
        if exclude_current:
            qs = qs.exclude(start_date__lte=today, end_date__gte=today)
        periods = list(qs.order_by("start_date"))
        locked = []
        errors = []
        for period in periods:
            try:
                _, updated = lock_accounting_period(
                    period_id=period.id,
                    performed_by=request.user,
                    reason=reason,
                )
                locked.append({"id": period.id, "code": period.code, "updated": updated})
            except Exception as exc:
                errors.append({"id": period.id, "code": period.code, "error": str(exc)})
        return Response(
            {
                "locked_count": len(locked),
                "error_count": len(errors),
                "locked": locked,
                "errors": errors,
            }
        )


    @action(detail=False, methods=["post"], url_path="reopen-current")
    def reopen_current(self, request):
        """Reopen the accounting period that covers today, if it is LOCKED.
        Safe to call even when the period is already OPEN."""
        from django.utils import timezone
        today = timezone.localdate()
        period = (
            AccountingPeriod.objects
            .select_related("financial_year")
            .filter(start_date__lte=today, end_date__gte=today)
            .order_by("start_date", "id")
            .first()
        )
        if period is None:
            return Response({"detail": "No accounting period covers today.", "reopened": False}, status=status.HTTP_404_NOT_FOUND)
        if period.status == AccountingPeriodStatus.OPEN and not period.is_locked:
            payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
            return Response({"detail": "Current period is already OPEN.", "reopened": False, "period": payload.data})
        reason = (request.data or {}).get("reason", "Reopen current period to restore posting readiness.")
        period, updated = unlock_accounting_period(
            period_id=period.id,
            performed_by=request.user,
            reason=reason,
        )
        payload = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        return Response({"detail": f"Period {period.code} reopened.", "reopened": updated, "period": payload.data})

    @action(detail=False, methods=["get"], url_path="current-period-status")
    def current_period_status(self, request):
        """Return the period that covers today and its posting readiness."""
        from django.utils import timezone
        today = timezone.localdate()
        period = (
            AccountingPeriod.objects
            .select_related("financial_year", "locked_by")
            .filter(start_date__lte=today, end_date__gte=today)
            .order_by("start_date", "id")
            .first()
        )
        if period is None:
            return Response({"current_period": None, "posting_open": False, "message": "No period covers today."})
        serializer = AccountingPeriodSerializer(period, context=self.get_serializer_context())
        posting_open = period.status == AccountingPeriodStatus.OPEN and not period.is_locked
        return Response({
            "current_period": serializer.data,
            "posting_open": posting_open,
            "message": "Ready for posting." if posting_open else f"Period {period.code} is {period.status} — posting blocked.",
        })


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
    pagination_class = AdminAccountingPagination
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
    pagination_class = AdminAccountingPagination
    search_fields = ["settlement_no", "vendor__name", "reference_no"]
    ordering_fields = ["settlement_date", "created_at", "settlement_no"]
    ordering = ["-settlement_date", "-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get("branch")
        vendor_id = self.request.query_params.get("vendor")
        purchase_bill_id = self.request.query_params.get("purchase_bill")
        status_value = (self.request.query_params.get("status") or "").strip().upper()
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if vendor_id:
            queryset = queryset.filter(vendor_id=vendor_id)
        if purchase_bill_id:
            queryset = queryset.filter(purchase_bill_id=purchase_bill_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset

    def get_serializer_class(self):
        if self.action in {"post_settlement", "cancel"}:
            return PeriodActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="post")
    def post_settlement(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            settlement, updated = post_vendor_settlement(
                vendor_settlement_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = VendorSettlementSerializer(settlement, context=self.get_serializer_context())
        return Response({"updated": updated, "vendor_settlement": payload.data})

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            settlement, updated = cancel_vendor_settlement(
                vendor_settlement_id=int(pk),
                performed_by=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
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


class EmployeeImportPreviewView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(preview_employee_import(self._uploaded_file(request)))


class EmployeeImportPostView(_AccountingImportView):
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = post_employee_import(
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
