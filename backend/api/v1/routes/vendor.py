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

urlpatterns = [
    path("dashboard/", VendorSelfDashboardView.as_view()),
    path("profile/", VendorSelfProfileView.as_view()),
    path("ledger/", VendorSelfLedgerView.as_view()),
    path("outstanding/", VendorSelfOutstandingView.as_view()),
    path("quote-requests/", VendorSelfQuoteRequestsView.as_view()),
    path("quote-requests/<int:pk>/", VendorSelfQuoteRequestDetailView.as_view()),
    path("quote-requests/<int:pk>/quote/", VendorSelfQuoteSubmitView.as_view()),
    path("products/", VendorSelfProductsView.as_view()),
    path("purchase-orders/", VendorSelfPurchaseOrdersView.as_view()),
    path("purchase-returns/", VendorSelfPurchaseReturnsView.as_view()),
]
