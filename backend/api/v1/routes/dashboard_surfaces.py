from django.urls import path

from api.v1.views.dashboard_surfaces import (
    DashboardOverdueSurfaceView,
    DashboardRecentPaymentsSurfaceView,
    DashboardReconciliationExceptionsSurfaceView,
    DashboardSummaryV2View,
    DashboardUpcomingSurfaceView,
    DashboardWinnersSurfaceView,
)

urlpatterns = [
    path("summary-v2/", DashboardSummaryV2View.as_view()),
    path("surfaces/upcoming/", DashboardUpcomingSurfaceView.as_view()),
    path("surfaces/overdue/", DashboardOverdueSurfaceView.as_view()),
    path("surfaces/recent-payments/", DashboardRecentPaymentsSurfaceView.as_view()),
    path("surfaces/winners/", DashboardWinnersSurfaceView.as_view()),
    path(
        "surfaces/reconciliation-exceptions/",
        DashboardReconciliationExceptionsSurfaceView.as_view(),
    ),
]
