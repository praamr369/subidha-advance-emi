"""
HR Complete Routes Module
Consolidated HR operations including staff, attendance, leave, payroll, and expense claims.

Session 4 Consolidation (2026-06-24):
  - Moved 15 routes from accounting module to HR module
  - All employee workflows now under single /admin/hr/* prefix
  - Accounting module now handles GL posting & tax compliance only
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from api.v1.views.accounting import (
    EmployeeAttendanceViewSet,
    EmployeeProfileViewSet,
    LeaveRequestViewSet,
    LeaveTypeViewSet,
    PayrollPeriodViewSet,
    SalarySheetViewSet,
    EmployeeExpenseClaimViewSet,
    EmployeeExpenseClaimPaymentViewSet,
)

router = DefaultRouter()

# ============================================================================
# EMPLOYEE MANAGEMENT (Staff Master Data)
# ============================================================================
router.register(
    r"staff",
    EmployeeProfileViewSet,
    basename="hr-staff"
)

# ============================================================================
# ATTENDANCE MANAGEMENT
# ============================================================================
router.register(
    r"attendance",
    EmployeeAttendanceViewSet,
    basename="hr-attendance"
)

# ============================================================================
# LEAVE MANAGEMENT
# ============================================================================
router.register(
    r"leave-types",
    LeaveTypeViewSet,
    basename="hr-leave-types"
)

router.register(
    r"leave-requests",
    LeaveRequestViewSet,
    basename="hr-leave-requests"
)

# ============================================================================
# PAYROLL MANAGEMENT
# ============================================================================
router.register(
    r"payroll-periods",
    PayrollPeriodViewSet,
    basename="hr-payroll-periods"
)

router.register(
    r"payroll",
    SalarySheetViewSet,
    basename="hr-payroll"
)

router.register(
    r"payroll-payments",
    EmployeeExpenseClaimPaymentViewSet,
    basename="hr-payroll-payments"
)

# ============================================================================
# EXPENSE CLAIMS MANAGEMENT
# ============================================================================
router.register(
    r"expense-claims",
    EmployeeExpenseClaimViewSet,
    basename="hr-expense-claims"
)

# Export URL patterns
urlpatterns = router.urls

"""
MIGRATION NOTES:
  These routes were moved from accounting.py on 2026-06-24:
    - employees → hr/staff/
    - attendance → hr/attendance/
    - payroll-periods → hr/payroll-periods/
    - leave-types → hr/leave-types/
    - leave-requests → hr/leave-requests/
    - salary-sheets → hr/payroll/
    - expense-claims → hr/expense-claims/
    - expense-claim-payments → hr/payroll-payments/

  ACCOUNTING MODULE KEEPS:
    - salary-payments (GL posting)
    - All GL, tax, reconciliation routes

  This consolidation ensures:
    ✅ All HR workflows are under /admin/hr/*
    ✅ Accounting focused on GL posting & tax compliance
    ✅ Perfect module semantics and organization
"""
