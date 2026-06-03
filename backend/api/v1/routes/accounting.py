from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.accounting import (
    AccountingValidationView,
    AttendanceCalendarView,
    ChartOfAccountViewSet,
    EmployeeExpenseClaimPaymentViewSet,
    EmployeeExpenseClaimViewSet,
    EmployeeAttendanceViewSet,
    EmployeeProfileViewSet,
    ExpenseVoucherViewSet,
    FinanceAccountViewSet,
    JournalEntryViewSet,
    JournalGroupBalanceView,
    JournalGroupReverseView,
    LeaveRequestViewSet,
    LeaveTypeViewSet,
    MoneyMovementViewSet,
    PayrollPeriodViewSet,
    SalaryPaymentViewSet,
    SalarySheetViewSet,
    StaffLedgerView,
    VendorViewSet,
)
from api.v1.views.accounting_commission_payout_bridge import (
    CommissionSettlementBridgeRunView,
    PayoutBatchBridgeRunView,
)
from api.v1.views.accounting_phase2 import (
    BalanceSheetReportView,
    BridgeRunView,
    CashbookReportView,
    CreditNoteViewSet,
    DebitNoteViewSet,
    GeneralLedgerReportView,
    GstExportPackListCreateView,
    ItrExportPackDetailView,
    ItrExportPackDownloadView,
    ItrExportPackListCreateView,
    ProfitLossReportView,
    TaxInvoiceViewSet,
    TrialBalanceReportView,
)
from api.v1.views.accounting_phase3 import (
    AccountingBridgePostingViewSet,
    AccountingPeriodViewSet,
    AccountingPurchaseBillViewSet,
    AssetCategoryViewSet,
    AssetViewSet,
    BankBookView,
    CashBookView,
    ChartOfAccountsImportPostView,
    ChartOfAccountsImportPreviewView,
    DepreciationRunViewSet,
    EmployeeImportPostView,
    EmployeeImportPreviewView,
    EmiPaymentBridgeRunView,
    EmiSubscriptionBridgeRunView,
    EmiWaiverBridgeRunView,
    InventoryBridgeRunView,
    PostingLockViewSet,
    PurchaseBookView,
    RetailSaleBridgeRunView,
    SalesBookView,
    UpiBookView,
    VendorImportPostView,
    VendorImportPreviewView,
    VendorSettlementViewSet,
)

router = DefaultRouter()
router.register(r"chart-of-accounts", ChartOfAccountViewSet, basename="accounting-chart-of-accounts")
router.register(r"journal-entries", JournalEntryViewSet, basename="accounting-journal-entries")
router.register(r"finance-accounts", FinanceAccountViewSet, basename="accounting-finance-accounts")
router.register(r"money-movements", MoneyMovementViewSet, basename="accounting-money-movements")
router.register(r"vendors", VendorViewSet, basename="accounting-vendors")
router.register(r"expenses", ExpenseVoucherViewSet, basename="accounting-expenses")
router.register(r"employees", EmployeeProfileViewSet, basename="accounting-employees")
router.register(r"attendance", EmployeeAttendanceViewSet, basename="accounting-attendance")
router.register(r"payroll-periods", PayrollPeriodViewSet, basename="accounting-payroll-periods")
router.register(r"leave-types", LeaveTypeViewSet, basename="accounting-leave-types")
router.register(r"leave-requests", LeaveRequestViewSet, basename="accounting-leave-requests")
router.register(r"salary-sheets", SalarySheetViewSet, basename="accounting-salary-sheets")
router.register(r"salary-payments", SalaryPaymentViewSet, basename="accounting-salary-payments")
router.register(r"expense-claims", EmployeeExpenseClaimViewSet, basename="accounting-expense-claims")
router.register(r"expense-claim-payments", EmployeeExpenseClaimPaymentViewSet, basename="accounting-expense-claim-payments")
router.register(r"tax-invoices", TaxInvoiceViewSet, basename="accounting-tax-invoices")
router.register(r"credit-notes", CreditNoteViewSet, basename="accounting-credit-notes")
router.register(r"debit-notes", DebitNoteViewSet, basename="accounting-debit-notes")
router.register(r"periods", AccountingPeriodViewSet, basename="accounting-periods")
router.register(r"locks", PostingLockViewSet, basename="accounting-locks")
router.register(r"bridge-postings", AccountingBridgePostingViewSet, basename="accounting-bridge-postings")
router.register(r"assets/categories", AssetCategoryViewSet, basename="accounting-asset-categories")
router.register(r"assets", AssetViewSet, basename="accounting-assets")
router.register(r"depreciation/runs", DepreciationRunViewSet, basename="accounting-depreciation-runs")
router.register(r"purchase-bills", AccountingPurchaseBillViewSet, basename="accounting-purchase-bills")
router.register(r"vendor-settlements", VendorSettlementViewSet, basename="accounting-vendor-settlements")

urlpatterns = [
    path("controls/validation/", AccountingValidationView.as_view()),
    path("controls/journal-groups/<int:pk>/balance/", JournalGroupBalanceView.as_view()),
    path("controls/journal-groups/<int:pk>/reverse/", JournalGroupReverseView.as_view()),
    path("reports/attendance-calendar/", AttendanceCalendarView.as_view()),
    path("reports/staff-ledger/", StaffLedgerView.as_view()),
    path("reports/trial-balance/", TrialBalanceReportView.as_view()),
    path("reports/profit-loss/", ProfitLossReportView.as_view()),
    path("reports/balance-sheet/", BalanceSheetReportView.as_view()),
    path("reports/general-ledger/", GeneralLedgerReportView.as_view()),
    path("reports/cashbook/", CashbookReportView.as_view()),
    path("books/cash/", CashBookView.as_view()),
    path("books/bank/", BankBookView.as_view()),
    path("books/upi/", UpiBookView.as_view()),
    path("books/sales/", SalesBookView.as_view()),
    path("books/purchase/", PurchaseBookView.as_view()),
    path("exports/itr-pack/", ItrExportPackListCreateView.as_view()),
    path("exports/itr-pack/<int:pk>/", ItrExportPackDetailView.as_view()),
    path("exports/itr-pack/<int:pk>/download/", ItrExportPackDownloadView.as_view()),
    path("exports/gst-pack/", GstExportPackListCreateView.as_view()),
    path("imports/chart-of-accounts/preview/", ChartOfAccountsImportPreviewView.as_view()),
    path("imports/chart-of-accounts/post/", ChartOfAccountsImportPostView.as_view()),
    path("imports/employees/preview/", EmployeeImportPreviewView.as_view()),
    path("imports/employees/post/", EmployeeImportPostView.as_view()),
    path("imports/vendors/preview/", VendorImportPreviewView.as_view()),
    path("imports/vendors/post/", VendorImportPostView.as_view()),
    path("bridges/run/", BridgeRunView.as_view()),
    path("bridges/run-retail-sale/", RetailSaleBridgeRunView.as_view()),
    path("bridges/run-inventory-posting/", InventoryBridgeRunView.as_view()),
    path("bridges/run-emi-subscription/", EmiSubscriptionBridgeRunView.as_view()),
    path("bridges/run-emi-payment/", EmiPaymentBridgeRunView.as_view()),
    path("bridges/run-emi-waiver/", EmiWaiverBridgeRunView.as_view()),
    path("bridges/run-commission-settlement/", CommissionSettlementBridgeRunView.as_view()),
    path("bridges/run-payout-batch/", PayoutBatchBridgeRunView.as_view()),
    path("", include(router.urls)),
]
