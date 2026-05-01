from django.urls import path

from api.v1.views.cashier import (
    CashierCollectAdvance,
    CashierCollectDirectSalePayment,
    CashierCollectPayment,
    CashierFinanceAccountListView,
    CashierPendingDirectSales,
    CashierSearchDirectSaleView,
)
from api.v1.views.contract_references import (
    CashierReceivablesSearchView,
    UnifiedReceivablePreviewView,
    UnifiedReceivableCollectView,
)
from api.v1.views.cashier_dashboard import (
    CashierDashboardView,
    CashierPaymentDetailView,
    CashierPaymentHistoryView,
    CashierPendingEmis,
    CashierSearchEmiView,
)
from api.v1.views.views.audit_views import CashierBusinessEventLogListView
from api.v1.views.notifications import (
    CashierNotificationListView,
    CashierNotificationMarkReadView,
    CashierUnreadNotificationCountView,
)

urlpatterns = [
    path("dashboard/", CashierDashboardView.as_view(), name="cashier-dashboard"),
    path("pending-emis/", CashierPendingEmis.as_view(), name="cashier-pending-emis"),
    path("pending-direct-sales/", CashierPendingDirectSales.as_view(), name="cashier-pending-direct-sales"),
    path("finance-accounts/", CashierFinanceAccountListView.as_view(), name="cashier-finance-accounts"),
    path("search-emis/", CashierSearchEmiView.as_view(), name="cashier-search-emis"),
    path("search-direct-sales/", CashierSearchDirectSaleView.as_view(), name="cashier-search-direct-sales"),
    path("receivables/search/", CashierReceivablesSearchView.as_view(), name="cashier-receivables-search"),
    path("receivables/preview/", UnifiedReceivablePreviewView.as_view(), name="cashier-receivables-preview"),
    path("receivables/collect/", UnifiedReceivableCollectView.as_view(), name="cashier-receivables-collect"),
    path("payments/", CashierPaymentHistoryView.as_view(), name="cashier-payment-history"),
    path("payments/<int:pk>/", CashierPaymentDetailView.as_view(), name="cashier-payment-detail"),
    path("audit/events/", CashierBusinessEventLogListView.as_view(), name="cashier-business-event-list"),
    path("notifications/", CashierNotificationListView.as_view(), name="cashier-notifications-list"),
    path("notifications/unread-count/", CashierUnreadNotificationCountView.as_view(), name="cashier-notifications-unread"),
    path("notifications/<int:pk>/read/", CashierNotificationMarkReadView.as_view(), name="cashier-notifications-read"),
    path("collect-payment/", CashierCollectPayment.as_view(), name="cashier-collect-payment"),
    path("collect-advance/", CashierCollectAdvance.as_view(), name="cashier-collect-advance"),
    path("collect-direct-sale/", CashierCollectDirectSalePayment.as_view(), name="cashier-collect-direct-sale"),
]
