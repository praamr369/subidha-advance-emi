from django.urls import path
from api.v1.views.crm_analytics import (
    CRMFunnelAnalyticsView,
    CRMProductPerformanceView,
    CRMTimelineAnalyticsView,
    CRMRequestTypeAnalyticsView,
    CRMAnalyticsSummaryView,
)

urlpatterns = [
    path(
        'summary/',
        CRMAnalyticsSummaryView.as_view(),
        name='crm-analytics-summary',
    ),
    path(
        'funnel/',
        CRMFunnelAnalyticsView.as_view(),
        name='crm-funnel-analytics',
    ),
    path(
        'products/',
        CRMProductPerformanceView.as_view(),
        name='crm-product-performance',
    ),
    path(
        'timeline/',
        CRMTimelineAnalyticsView.as_view(),
        name='crm-timeline-analytics',
    ),
    path(
        'by-type/',
        CRMRequestTypeAnalyticsView.as_view(),
        name='crm-by-type-analytics',
    ),
]
