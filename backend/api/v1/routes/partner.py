from django.urls import path

from api.v1.views.partner_collection_requests import (
    LegacyPartnerCollectionListCreateView,
    LegacyPartnerPaymentCollectView,
    PartnerCollectionRequestDetailView,
    PartnerCollectionRequestListCreateView,
)
from api.v1.views.partner_commission import (
    PartnerCommissionStatementExportView,
    PartnerCommissionView,
)
from api.v1.views.paginated_registers import (
    PaginatedPartnerCustomerListView,
    PaginatedPartnerSubscriptionListView,
)
from api.v1.views.partner_dashboard import (
    PartnerCustomerDetailView,
    PartnerDashboardView,
    PartnerEarningsSummaryView,
    PartnerPaymentDetailView,
    PartnerPaymentListView,
    PartnerSubscriptionDetailView,
)
from api.v1.views.phase4_finance import (
    PartnerFinanceSummaryView,
    PartnerLinkedCustomerPaymentsView,
    PartnerReceiptListView,
)
from api.v1.views.subscription_requests import (
    PartnerSubscriptionRequestCancelView,
    PartnerSubscriptionRequestDetailView,
    PartnerSubscriptionRequestListCreateView,
    PartnerSubscriptionRequestOptionsView,
)

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("subscriptions/", PaginatedPartnerSubscriptionListView.as_view()),
    path("subscriptions/<int:pk>/", PartnerSubscriptionDetailView.as_view()),
    path("subscription-request-options/", PartnerSubscriptionRequestOptionsView.as_view()),
    path("subscription-requests/", PartnerSubscriptionRequestListCreateView.as_view()),
    path("subscription-requests/<int:pk>/", PartnerSubscriptionRequestDetailView.as_view()),
    path("subscription-requests/<int:pk>/cancel/", PartnerSubscriptionRequestCancelView.as_view()),
    path("customers/", PaginatedPartnerCustomerListView.as_view()),
    path("customers/<int:pk>/", PartnerCustomerDetailView.as_view()),
    path("payments/", PartnerPaymentListView.as_view()),
    path("payments/<int:pk>/", PartnerPaymentDetailView.as_view()),
    # Phase 4: partner finance scope
    path("finance/summary/", PartnerFinanceSummaryView.as_view()),
    path("linked-customer-payments/", PartnerLinkedCustomerPaymentsView.as_view()),
    path("receipts/", PartnerReceiptListView.as_view()),
    path("payments/collect/", LegacyPartnerPaymentCollectView.as_view()),
    path("earnings/", PartnerEarningsSummaryView.as_view()),
    path("earnings/export/", PartnerCommissionStatementExportView.as_view()),
    path("commissions/", PartnerCommissionView.as_view()),
    path("collections/", LegacyPartnerCollectionListCreateView.as_view()),
    path("collection-requests/", PartnerCollectionRequestListCreateView.as_view()),
    path("collection-requests/<int:pk>/", PartnerCollectionRequestDetailView.as_view()),
]
