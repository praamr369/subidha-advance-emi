from django.urls import path

from api.v1.views.partner_collection_requests import (
    PartnerCollectionRequestDetailView,
    PartnerCollectionRequestListCreateView,
)
from api.v1.views.partner_commission import (
    PartnerCommissionStatementExportView,
    PartnerCommissionView,
)
from api.v1.views.partner_dashboard import (
    PartnerCustomerDetailView,
    PartnerCustomerListView,
    PartnerDashboardView,
    PartnerEarningsSummaryView,
    PartnerPaymentDetailView,
    PartnerPaymentListView,
    PartnerSubscriptionDetailView,
    PartnerSubscriptionListView,
)

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("subscriptions/", PartnerSubscriptionListView.as_view()),
    path("subscriptions/<int:pk>/", PartnerSubscriptionDetailView.as_view()),
    path("customers/", PartnerCustomerListView.as_view()),
    path("customers/<int:pk>/", PartnerCustomerDetailView.as_view()),
    path("payments/", PartnerPaymentListView.as_view()),
    path("payments/<int:pk>/", PartnerPaymentDetailView.as_view()),
    path("earnings/", PartnerEarningsSummaryView.as_view()),
    path("earnings/export/", PartnerCommissionStatementExportView.as_view()),
    path("commissions/", PartnerCommissionView.as_view()),
    path("collection-requests/", PartnerCollectionRequestListCreateView.as_view()),
    path("collection-requests/<int:pk>/", PartnerCollectionRequestDetailView.as_view()),
]
