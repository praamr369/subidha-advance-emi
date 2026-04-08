import csv
from io import StringIO

from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers.dashboard_surfaces import (
    DashboardSurfaceQuerySerializer,
    DashboardWindowQuerySerializer,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
    resolve_dashboard_window,
)
from subscriptions.services.dashboard_scopes import (
    DashboardScopeError,
    resolve_dashboard_scope,
)
from subscriptions.services.dashboard_surface_query_service import (
    list_overdue_items,
    paginate_surface_rows,
    list_recent_payments,
    list_reconciliation_exceptions,
    resolve_surface_ordering,
    SURFACE_OVERDUE,
    SURFACE_RECENT_PAYMENTS,
    SURFACE_RECONCILIATION_EXCEPTIONS,
    SURFACE_UPCOMING,
    SURFACE_WINNERS,
    list_upcoming_items,
    list_winners,
)


class BaseScopedDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def _resolve_scope(self, request):
        try:
            return resolve_dashboard_scope(request.user)
        except DashboardScopeError as exc:
            raise PermissionDenied(str(exc)) from exc


class DashboardSummaryV2View(BaseScopedDashboardView):
    def get(self, request):
        serializer = DashboardWindowQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        scope = self._resolve_scope(request)
        window_params = resolve_dashboard_window(**serializer.validated_data)
        dashboard = get_dashboard_summary(
            scope,
            request.user,
            window_params=window_params,
        )
        return Response(
            {
                "role": scope.code,
                **dashboard.identity,
                "filters": dashboard.filters,
                "summary": dashboard.summary,
                "winner_surface": dashboard.winner_surface,
                "reconciliation": dashboard.reconciliation,
            }
        )


class DashboardSurfaceBaseView(BaseScopedDashboardView):
    surface_code = ""
    filename_prefix = "dashboard-surface"

    def _validated_query(self, request):
        serializer = DashboardSurfaceQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def _window_params(self, validated_data):
        return resolve_dashboard_window(
            window=validated_data.get("window"),
            as_of=validated_data.get("as_of"),
            start_date=validated_data.get("start_date"),
            end_date=validated_data.get("end_date"),
        )

    def _resolved_ordering(self, validated_data):
        return resolve_surface_ordering(self.surface_code, validated_data.get("ordering"))

    def _paginated_payload(self, *, results, validated_data):
        return paginate_surface_rows(
            results,
            page=validated_data["page"],
            page_size=validated_data["page_size"],
        )

    def _build_response(self, *, scope, results, window_params, validated_data):
        paginated = self._paginated_payload(results=results, validated_data=validated_data)
        return Response(
            {
                "role": scope.code,
                "filters": window_params.to_payload(),
                "count": paginated["count"],
                "page": paginated["page"],
                "page_size": paginated["page_size"],
                "total_pages": paginated["total_pages"],
                "ordering": self._resolved_ordering(validated_data),
                "results": paginated["results"],
            }
        )

    def _csv_columns(self):
        raise NotImplementedError

    def _rows(self, *, scope, request, validated, window_params):
        raise NotImplementedError

    def _build_csv_response(self, *, filename: str, rows: list[dict]):
        buffer = StringIO()
        writer = csv.DictWriter(buffer, fieldnames=[column[0] for column in self._csv_columns()])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key, _ in self._csv_columns()})

        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class DashboardSurfaceCsvExportView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        rows = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        filename = f"{self.filename_prefix}.csv"
        return self._build_csv_response(filename=filename, rows=rows)


class DashboardUpcomingSurfaceView(DashboardSurfaceBaseView):
    surface_code = SURFACE_UPCOMING
    filename_prefix = "dashboard-upcoming"

    def _rows(self, *, scope, request, validated, window_params):
        return list_upcoming_items(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=None,
            ordering=self._resolved_ordering(validated),
        )

    def _csv_columns(self):
        return [
            ("subscription_number", "subscription_number"),
            ("customer_name", "customer_name"),
            ("customer_phone", "customer_phone"),
            ("product_name", "product_name"),
            ("batch_code", "batch_code"),
            ("lucky_number", "lucky_number"),
            ("due_date", "due_date"),
            ("monthly_amount", "monthly_amount"),
            ("pending_amount", "pending_amount"),
            ("overdue_days", "overdue_days"),
            ("is_overdue", "is_overdue"),
            ("emi_id", "emi_id"),
            ("month_no", "month_no"),
        ]

    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        return self._build_response(
            scope=scope,
            results=results,
            window_params=window_params,
            validated_data=validated,
        )


class DashboardUpcomingSurfaceCsvExportView(DashboardSurfaceCsvExportView, DashboardUpcomingSurfaceView):
    pass


class DashboardOverdueSurfaceView(DashboardSurfaceBaseView):
    surface_code = SURFACE_OVERDUE
    filename_prefix = "dashboard-overdue"

    def _rows(self, *, scope, request, validated, window_params):
        return list_overdue_items(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=None,
            ordering=self._resolved_ordering(validated),
        )

    def _csv_columns(self):
        return [
            ("subscription_number", "subscription_number"),
            ("customer_name", "customer_name"),
            ("customer_phone", "customer_phone"),
            ("product_name", "product_name"),
            ("batch_code", "batch_code"),
            ("lucky_number", "lucky_number"),
            ("due_date", "due_date"),
            ("monthly_amount", "monthly_amount"),
            ("pending_amount", "pending_amount"),
            ("overdue_days", "overdue_days"),
            ("is_overdue", "is_overdue"),
            ("emi_id", "emi_id"),
            ("month_no", "month_no"),
        ]

    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        return self._build_response(
            scope=scope,
            results=results,
            window_params=window_params,
            validated_data=validated,
        )


class DashboardOverdueSurfaceCsvExportView(DashboardSurfaceCsvExportView, DashboardOverdueSurfaceView):
    pass


class DashboardRecentPaymentsSurfaceView(DashboardSurfaceBaseView):
    surface_code = SURFACE_RECENT_PAYMENTS
    filename_prefix = "dashboard-recent-payments"

    def _rows(self, *, scope, request, validated, window_params):
        return list_recent_payments(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=None,
            ordering=self._resolved_ordering(validated),
        )

    def _csv_columns(self):
        return [
            ("payment_id", "payment_id"),
            ("amount", "amount"),
            ("payment_date", "payment_date"),
            ("created_at", "created_at"),
            ("method", "method"),
            ("reference_no", "reference_no"),
            ("customer_name", "customer_name"),
            ("customer_phone", "customer_phone"),
            ("subscription_number", "subscription_number"),
            ("batch_code", "batch_code"),
            ("lucky_number", "lucky_number"),
            ("is_reversed", "is_reversed"),
        ]

    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        return self._build_response(
            scope=scope,
            results=results,
            window_params=window_params,
            validated_data=validated,
        )


class DashboardRecentPaymentsSurfaceCsvExportView(
    DashboardSurfaceCsvExportView,
    DashboardRecentPaymentsSurfaceView,
):
    pass


class DashboardWinnersSurfaceView(DashboardSurfaceBaseView):
    surface_code = SURFACE_WINNERS
    filename_prefix = "dashboard-winners"

    def _rows(self, *, scope, request, validated, window_params):
        return list_winners(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=None,
            ordering=self._resolved_ordering(validated),
        )

    def _csv_columns(self):
        return [
            ("subscription_number", "subscription_number"),
            ("customer_name", "customer_name"),
            ("customer_phone", "customer_phone"),
            ("product_name", "product_name"),
            ("batch_code", "batch_code"),
            ("lucky_number", "lucky_number"),
            ("winner_status", "winner_status"),
            ("winner_month", "winner_month"),
            ("waived_emi_count", "waived_emi_count"),
            ("waived_amount", "waived_amount"),
            ("draw_id", "draw_id"),
            ("draw_month", "draw_month"),
            ("draw_revealed_at", "draw_revealed_at"),
            ("remaining_amount", "remaining_amount"),
        ]

    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        return self._build_response(
            scope=scope,
            results=results,
            window_params=window_params,
            validated_data=validated,
        )


class DashboardWinnersSurfaceCsvExportView(DashboardSurfaceCsvExportView, DashboardWinnersSurfaceView):
    pass


class DashboardReconciliationExceptionsSurfaceView(DashboardSurfaceBaseView):
    surface_code = SURFACE_RECONCILIATION_EXCEPTIONS
    filename_prefix = "dashboard-reconciliation-exceptions"

    def _rows(self, *, scope, request, validated, window_params):
        return list_reconciliation_exceptions(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=None,
            ordering=self._resolved_ordering(validated),
        )

    def _csv_columns(self):
        return [
            ("subscription_number", "subscription_number"),
            ("customer_name", "customer_name"),
            ("total_amount", "total_amount"),
            ("paid_amount", "paid_amount"),
            ("waived_amount", "waived_amount"),
            ("pending_outstanding", "pending_outstanding"),
            ("computed_outstanding", "computed_outstanding"),
            ("delta", "delta"),
        ]

    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = self._rows(
            scope=scope,
            request=request,
            validated=validated,
            window_params=window_params,
        )
        return self._build_response(
            scope=scope,
            results=results,
            window_params=window_params,
            validated_data=validated,
        )


class DashboardReconciliationExceptionsSurfaceCsvExportView(
    DashboardSurfaceCsvExportView,
    DashboardReconciliationExceptionsSurfaceView,
):
    pass
