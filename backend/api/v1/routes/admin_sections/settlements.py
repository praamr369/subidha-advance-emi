from django.urls import include, path
from api.v1.views.admin_settlements import BankStatementImportDetailView
from api.v1.views.admin_settlements import BankStatementImportListCreateView
from api.v1.views.admin_settlements import BankStatementLineListView
from api.v1.views.admin_settlements import CashierDayCloseApproveView
from api.v1.views.admin_settlements import CashierDayCloseDetailView
from api.v1.views.admin_settlements import CashierDayCloseListView
from api.v1.views.admin_settlements import CashierDayCloseRejectView
from api.v1.views.admin_settlements import SettlementAllocationDetailView
from api.v1.views.admin_settlements import SettlementAllocationListCreateView
from api.v1.views.admin_settlements import SettlementAllocationVoidView
from api.v1.views.admin_settlements import SettlementLookupFinanceAccountView
from api.v1.views.admin_settlements import SettlementLookupMoneyMovementsView
from api.v1.views.admin_settlements import SettlementLookupPaymentsView
from api.v1.views.admin_settlements import SettlementLookupReceiptsView
from api.v1.views.admin_settlements import SettlementResolveFinanceAccountView
from api.v1.views.admin_settlements import SettlementResolveMoneyMovementsView
from api.v1.views.admin_settlements import SettlementResolvePaymentsView
from api.v1.views.admin_settlements import SettlementResolveReceiptsView
from api.v1.views.admin_settlements import UpiSettlementImportDetailView
from api.v1.views.admin_settlements import UpiSettlementImportListCreateView
from api.v1.views.admin_settlements import UpiSettlementLineListView

urlpatterns = [
    # Phase L1: settlement imports
    path("settlements/bank-imports/", BankStatementImportListCreateView.as_view(), name="admin-bank-imports-list-create"),
    path("settlements/bank-imports/<int:pk>/", BankStatementImportDetailView.as_view(), name="admin-bank-imports-detail"),
    path("settlements/bank-imports/<int:pk>/lines/", BankStatementLineListView.as_view(), name="admin-bank-imports-lines"),
    path("settlements/upi-imports/", UpiSettlementImportListCreateView.as_view(), name="admin-upi-imports-list-create"),
    path("settlements/upi-imports/<int:pk>/", UpiSettlementImportDetailView.as_view(), name="admin-upi-imports-detail"),
    path("settlements/upi-imports/<int:pk>/lines/", UpiSettlementLineListView.as_view(), name="admin-upi-imports-lines"),
    # Phase L2.2: hardened settlement lookup endpoints (admin-only, read-only)
    path("settlements/lookups/finance-accounts/", SettlementLookupFinanceAccountView.as_view(), name="admin-settlement-lookup-finance-accounts"),
    path("settlements/lookups/finance-accounts/<int:pk>/", SettlementResolveFinanceAccountView.as_view(), name="admin-settlement-resolve-finance-accounts"),
    path("settlements/lookups/payments/", SettlementLookupPaymentsView.as_view(), name="admin-settlement-lookup-payments"),
    path("settlements/lookups/payments/<int:pk>/", SettlementResolvePaymentsView.as_view(), name="admin-settlement-resolve-payments"),
    path("settlements/lookups/receipts/", SettlementLookupReceiptsView.as_view(), name="admin-settlement-lookup-receipts"),
    path("settlements/lookups/receipts/<int:pk>/", SettlementResolveReceiptsView.as_view(), name="admin-settlement-resolve-receipts"),
    path("settlements/lookups/money-movements/", SettlementLookupMoneyMovementsView.as_view(), name="admin-settlement-lookup-money-movements"),
    path("settlements/lookups/money-movements/<int:pk>/", SettlementResolveMoneyMovementsView.as_view(), name="admin-settlement-resolve-money-movements"),
    # Phase L2: manual settlement allocations (admin-only)
    path("settlements/allocations/", SettlementAllocationListCreateView.as_view(), name="admin-settlement-allocations-list-create"),
    path("settlements/allocations/<int:pk>/", SettlementAllocationDetailView.as_view(), name="admin-settlement-allocations-detail"),
    path("settlements/allocations/<int:pk>/void/", SettlementAllocationVoidView.as_view(), name="admin-settlement-allocations-void"),
    # Phase L3: cashier day-close (admin approval workflow)
    path("settlements/cashier-day-closes/", CashierDayCloseListView.as_view(), name="admin-cashier-day-closes-list"),
    path("settlements/cashier-day-closes/<int:pk>/", CashierDayCloseDetailView.as_view(), name="admin-cashier-day-closes-detail"),
    path("settlements/cashier-day-closes/<int:pk>/approve/", CashierDayCloseApproveView.as_view(), name="admin-cashier-day-closes-approve"),
    path("settlements/cashier-day-closes/<int:pk>/reject/", CashierDayCloseRejectView.as_view(), name="admin-cashier-day-closes-reject"),
]
