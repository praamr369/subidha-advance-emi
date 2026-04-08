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
    list_recent_payments,
    list_reconciliation_exceptions,
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

    def _build_response(self, *, scope, results, window_params):
        return Response(
            {
                "role": scope.code,
                "filters": window_params.to_payload(),
                "count": len(results),
                "results": results,
            }
        )


class DashboardUpcomingSurfaceView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = list_upcoming_items(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=validated["limit"],
        )
        return self._build_response(scope=scope, results=results, window_params=window_params)


class DashboardOverdueSurfaceView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = list_overdue_items(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=validated["limit"],
        )
        return self._build_response(scope=scope, results=results, window_params=window_params)


class DashboardRecentPaymentsSurfaceView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = list_recent_payments(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=validated["limit"],
        )
        return self._build_response(scope=scope, results=results, window_params=window_params)


class DashboardWinnersSurfaceView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = list_winners(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=validated["limit"],
        )
        return self._build_response(scope=scope, results=results, window_params=window_params)


class DashboardReconciliationExceptionsSurfaceView(DashboardSurfaceBaseView):
    def get(self, request):
        validated = self._validated_query(request)
        scope = self._resolve_scope(request)
        window_params = self._window_params(validated)
        results = list_reconciliation_exceptions(
            scope=scope,
            actor_user=request.user,
            window_params=window_params,
            limit=validated["limit"],
        )
        return self._build_response(scope=scope, results=results, window_params=window_params)
