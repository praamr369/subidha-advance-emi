from django.urls import path

from api.v1.views.catalog import (
    PartnerCatalogDetailView,
    PartnerCatalogFacetsView,
    PartnerCatalogListView,
)
from api.v1.views.partner_kyc import (
    PartnerSelfKycAuditTrailView,
    PartnerSelfKycDocumentDownloadView,
    PartnerSelfKycDocumentListUploadView,
)
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
from api.v1.views.partner_finance import (
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
from api.v1.views.product_requests import (
    PartnerProductRequestListView,
    PartnerProductRequestOptionsView,
)
from api.v1.views.notifications import (
    PartnerNotificationListView,
    PartnerNotificationSummaryView,
)
from api.v1.views.username_change import PartnerSelfUsernameChangeView
from api.v1.views.partner_profile import PartnerSelfPasswordChangeView
from api.v1.views.partner_customer_kyc_requests import (
    PartnerCustomerKycRequestListCreateView,
    PartnerCustomerSearchView,
)

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("dashboard/summary/", PartnerDashboardView.as_view()),
    path("notifications/", PartnerNotificationListView.as_view()),
    path("notifications/summary/", PartnerNotificationSummaryView.as_view()),
    path("profile/username/", PartnerSelfUsernameChangeView.as_view()),
    path("profile/change-password/", PartnerSelfPasswordChangeView.as_view()),
    path("subscriptions/", PaginatedPartnerSubscriptionListView.as_view()),
    path("subscriptions/<int:pk>/", PartnerSubscriptionDetailView.as_view()),
    path("subscription-request-options/", PartnerSubscriptionRequestOptionsView.as_view()),
    path("subscription-requests/", PartnerSubscriptionRequestListCreateView.as_view()),
    path("subscription-requests/<int:pk>/", PartnerSubscriptionRequestDetailView.as_view()),
    path("subscription-requests/<int:pk>/cancel/", PartnerSubscriptionRequestCancelView.as_view()),
    path("product-request-options/", PartnerProductRequestOptionsView.as_view()),
    path("product-requests/", PartnerProductRequestListView.as_view()),
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
    # KYC self-service (Phase KYC)
    path("kyc/documents/", PartnerSelfKycDocumentListUploadView.as_view()),
    path("kyc/documents/upload/", PartnerSelfKycDocumentListUploadView.as_view()),
    path("kyc/documents/<int:doc_id>/download/", PartnerSelfKycDocumentDownloadView.as_view()),
    path("kyc/audit-trail/", PartnerSelfKycAuditTrailView.as_view()),
    # Approved product catalog — browse to raise a request for a customer
    path("catalog/", PartnerCatalogListView.as_view()),
    path("catalog/<int:pk>/", PartnerCatalogDetailView.as_view()),
    path("catalog/facets/", PartnerCatalogFacetsView.as_view()),
    # Customer KYC / Login ID requests from partner
    path("customer-kyc-requests/", PartnerCustomerKycRequestListCreateView.as_view()),
    path("customer-search/", PartnerCustomerSearchView.as_view()),
]
