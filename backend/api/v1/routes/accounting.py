from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.accounting import (
    ChartOfAccountViewSet,
    EmployeeProfileViewSet,
    ExpenseVoucherViewSet,
    FinanceAccountViewSet,
    JournalEntryViewSet,
    MoneyMovementViewSet,
    SalarySheetViewSet,
    VendorViewSet,
)
from api.v1.views.accounting_phase2 import (
    BalanceSheetReportView,
    BridgeRunView,
    CashbookReportView,
    CreditNoteViewSet,
    DebitNoteViewSet,
    GeneralLedgerReportView,
    ItrExportPackDetailView,
    ItrExportPackDownloadView,
    ItrExportPackListCreateView,
    ProfitLossReportView,
    TaxInvoiceViewSet,
    TrialBalanceReportView,
)

router = DefaultRouter()
router.register(r"chart-of-accounts", ChartOfAccountViewSet, basename="accounting-chart-of-accounts")
router.register(r"journal-entries", JournalEntryViewSet, basename="accounting-journal-entries")
router.register(r"finance-accounts", FinanceAccountViewSet, basename="accounting-finance-accounts")
router.register(r"money-movements", MoneyMovementViewSet, basename="accounting-money-movements")
router.register(r"vendors", VendorViewSet, basename="accounting-vendors")
router.register(r"expenses", ExpenseVoucherViewSet, basename="accounting-expenses")
router.register(r"employees", EmployeeProfileViewSet, basename="accounting-employees")
router.register(r"salary-sheets", SalarySheetViewSet, basename="accounting-salary-sheets")
router.register(r"tax-invoices", TaxInvoiceViewSet, basename="accounting-tax-invoices")
router.register(r"credit-notes", CreditNoteViewSet, basename="accounting-credit-notes")
router.register(r"debit-notes", DebitNoteViewSet, basename="accounting-debit-notes")

urlpatterns = [
    path("reports/trial-balance/", TrialBalanceReportView.as_view()),
    path("reports/profit-loss/", ProfitLossReportView.as_view()),
    path("reports/balance-sheet/", BalanceSheetReportView.as_view()),
    path("reports/general-ledger/", GeneralLedgerReportView.as_view()),
    path("reports/cashbook/", CashbookReportView.as_view()),
    path("exports/itr-pack/", ItrExportPackListCreateView.as_view()),
    path("exports/itr-pack/<int:pk>/", ItrExportPackDetailView.as_view()),
    path("exports/itr-pack/<int:pk>/download/", ItrExportPackDownloadView.as_view()),
    path("bridges/run/", BridgeRunView.as_view()),
    path("", include(router.urls)),
]
