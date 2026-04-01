from django.urls import path

from api.v1.views.cashier import CashierCollectPayment
from api.v1.views.cashier_dashboard import (
    CashierDashboardView,
    CashierPaymentDetailView,
    CashierPaymentHistoryView,
    CashierPendingEmis,
    CashierSearchEmiView,
)

urlpatterns = [
    path("dashboard/", CashierDashboardView.as_view(), name="cashier-dashboard"),
    path("pending-emis/", CashierPendingEmis.as_view(), name="cashier-pending-emis"),
    path("search-emis/", CashierSearchEmiView.as_view(), name="cashier-search-emis"),
    path("payments/", CashierPaymentHistoryView.as_view(), name="cashier-payment-history"),
    path("payments/<int:pk>/", CashierPaymentDetailView.as_view(), name="cashier-payment-detail"),
    path("collect-payment/", CashierCollectPayment.as_view(), name="cashier-collect-payment"),
]
