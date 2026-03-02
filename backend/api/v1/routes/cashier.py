from django.urls import path
from api.v1.views.cashier import (
    CashierDashboardView,
    CashierPendingEmis,
    CashierCollectPayment,
)

urlpatterns = [
    path("dashboard/", CashierDashboardView.as_view(), name="cashier-dashboard"),
    path("pending-emis/", CashierPendingEmis.as_view(), name="cashier-pending-emis"),
    path("collect-payment/", CashierCollectPayment.as_view(), name="cashier-collect-payment"),
]