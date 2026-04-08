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

router = DefaultRouter()
router.register(r"chart-of-accounts", ChartOfAccountViewSet, basename="accounting-chart-of-accounts")
router.register(r"journal-entries", JournalEntryViewSet, basename="accounting-journal-entries")
router.register(r"finance-accounts", FinanceAccountViewSet, basename="accounting-finance-accounts")
router.register(r"money-movements", MoneyMovementViewSet, basename="accounting-money-movements")
router.register(r"vendors", VendorViewSet, basename="accounting-vendors")
router.register(r"expenses", ExpenseVoucherViewSet, basename="accounting-expenses")
router.register(r"employees", EmployeeProfileViewSet, basename="accounting-employees")
router.register(r"salary-sheets", SalarySheetViewSet, basename="accounting-salary-sheets")

urlpatterns = [
    path("", include(router.urls)),
]
