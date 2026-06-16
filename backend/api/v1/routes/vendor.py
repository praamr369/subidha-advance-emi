from django.urls import path

from api.v1.views.vendor_ops import (
    VendorSelfDashboardView,
    VendorSelfLedgerView,
    VendorSelfOutstandingView,
    VendorSelfPurchaseOrdersView,
    VendorSelfPurchaseReturnsView,
    VendorSelfProductsView,
    VendorSelfProfileView,
    VendorSelfQuoteRequestDetailView,
    VendorSelfQuoteRequestsView,
    VendorSelfQuoteSubmitView,
)
from api.v1.views.notifications import (
    VendorNotificationListView,
    VendorNotificationSummaryView,
)
from api.v1.views.vendor_kyc import (
    VendorSelfKycAuditTrailView,
    VendorSelfKycDocumentDownloadView,
    VendorSelfKycDocumentListUploadView,
)

urlpatterns = [
    path("dashboard/", VendorSelfDashboardView.as_view()),
    path("dashboard/summary/", VendorSelfDashboardView.as_view()),
    path("notifications/", VendorNotificationListView.as_view()),
    path("notifications/summary/", VendorNotificationSummaryView.as_view()),
    path("profile/", VendorSelfProfileView.as_view()),
    path("ledger/", VendorSelfLedgerView.as_view()),
    path("outstanding/", VendorSelfOutstandingView.as_view()),
    path("quote-requests/", VendorSelfQuoteRequestsView.as_view()),
    path("quote-requests/<int:pk>/", VendorSelfQuoteRequestDetailView.as_view()),
    path("quote-requests/<int:pk>/quote/", VendorSelfQuoteSubmitView.as_view()),
    path("products/", VendorSelfProductsView.as_view()),
    path("purchase-orders/", VendorSelfPurchaseOrdersView.as_view()),
    path("purchase-returns/", VendorSelfPurchaseReturnsView.as_view()),
    # KYC self-service (Phase KYC)
    path("kyc/documents/", VendorSelfKycDocumentListUploadView.as_view()),
    path("kyc/documents/upload/", VendorSelfKycDocumentListUploadView.as_view()),
    path("kyc/documents/<int:doc_id>/download/", VendorSelfKycDocumentDownloadView.as_view()),
    path("kyc/audit-trail/", VendorSelfKycAuditTrailView.as_view()),
]
