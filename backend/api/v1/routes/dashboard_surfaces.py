from django.urls import path

from api.v1.views.dashboard_surfaces import (
    DashboardOverdueSurfaceView,
    DashboardOverdueSurfaceCsvExportView,
    DashboardRecentPaymentsSurfaceView,
    DashboardRecentPaymentsSurfaceCsvExportView,
    DashboardReconciliationExceptionsSurfaceView,
    DashboardReconciliationExceptionsSurfaceCsvExportView,
    DashboardSummaryV2View,
    DashboardUpcomingSurfaceView,
    DashboardUpcomingSurfaceCsvExportView,
    DashboardWinnersSurfaceView,
    DashboardWinnersSurfaceCsvExportView,
)

urlpatterns = [
    path("summary-v2/", DashboardSummaryV2View.as_view()),
    path("surfaces/upcoming/", DashboardUpcomingSurfaceView.as_view()),
    path("surfaces/upcoming/export.csv", DashboardUpcomingSurfaceCsvExportView.as_view()),
    path("surfaces/overdue/", DashboardOverdueSurfaceView.as_view()),
    path("surfaces/overdue/export.csv", DashboardOverdueSurfaceCsvExportView.as_view()),
    path("surfaces/recent-payments/", DashboardRecentPaymentsSurfaceView.as_view()),
    path(
        "surfaces/recent-payments/export.csv",
        DashboardRecentPaymentsSurfaceCsvExportView.as_view(),
    ),
    path("surfaces/winners/", DashboardWinnersSurfaceView.as_view()),
    path("surfaces/winners/export.csv", DashboardWinnersSurfaceCsvExportView.as_view()),
    path(
        "surfaces/reconciliation-exceptions/",
        DashboardReconciliationExceptionsSurfaceView.as_view(),
    ),
    path(
        "surfaces/reconciliation-exceptions/export.csv",
        DashboardReconciliationExceptionsSurfaceCsvExportView.as_view(),
    ),
]
