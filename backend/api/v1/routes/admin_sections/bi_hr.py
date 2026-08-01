from django.urls import include, path
from api.v1.routes import admin_hr_complete
from api.v1.views.admin_bi import AdminBiBatchPerformanceView
from api.v1.views.admin_bi import AdminBiCashflowView
from api.v1.views.admin_bi import AdminBiCustomerInsightsView
from api.v1.views.admin_bi import AdminBiHrCostInsightsView
from api.v1.views.admin_bi import AdminBiInsightsView
from api.v1.views.admin_bi import AdminBiInventoryIntelligenceView
from api.v1.views.admin_bi import AdminBiProfitabilityView
from api.v1.views.admin_bi import AdminBiSummaryView
from api.v1.views.admin_erp import AdminGlobalSearchView
from api.v1.views.admin_hr import AdminHrAttendanceListCreateView
from api.v1.views.admin_hr import AdminHrExpenseClaimPatchView
from api.v1.views.admin_hr import AdminHrExpenseClaimsListCreateView
from api.v1.views.admin_hr import AdminHrLeaveRequestPatchView
from api.v1.views.admin_hr import AdminHrLeaveRequestsListCreateView
from api.v1.views.admin_hr import AdminHrPayrollView
from api.v1.views.admin_hr import AdminHrSalaryAgreementPdfView
from api.v1.views.admin_hr import AdminHrSalaryPaymentsListCreateView
from api.v1.views.admin_hr import AdminHrStaffDocumentPatchView
from api.v1.views.admin_hr import AdminHrStaffDocumentReviewView
from api.v1.views.admin_hr import AdminHrStaffDocumentsListCreateView
from api.v1.views.admin_hr import AdminHrStaffLeaveBalanceView
from api.v1.views.admin_hr import AdminHrStaffListCreateView
from api.v1.views.admin_hr import AdminHrStaffPatchView
from api.v1.views.admin_hr import AdminHrStaffProfilePdfView
from api.v1.views.admin_hr import AdminHrStaffStatusView
from api.v1.views.admin_hr import AdminHrSummaryView

urlpatterns = [
    path("global-search/", AdminGlobalSearchView.as_view()),
    # Phase 7C: BI control center snapshot (admin-only, read-only)
    path("bi/summary/", AdminBiSummaryView.as_view()),
    # Phase 10: BI + operational insights layer (admin-only, read-only)
    path("bi/insights/", AdminBiInsightsView.as_view()),
    path("bi/profitability/", AdminBiProfitabilityView.as_view()),
    path("bi/customer-insights/", AdminBiCustomerInsightsView.as_view()),
    path("bi/batch-performance/", AdminBiBatchPerformanceView.as_view()),
    path("bi/cashflow/", AdminBiCashflowView.as_view()),
    path("bi/inventory-intelligence/", AdminBiInventoryIntelligenceView.as_view()),
    path("bi/hr-costs/", AdminBiHrCostInsightsView.as_view()),
    # Phase 7B: HR workspace (admin-only aggregation and actions)
    path("hr/summary/", AdminHrSummaryView.as_view()),
    path("hr/staff/", AdminHrStaffListCreateView.as_view()),
    path("hr/staff/<int:staff_id>/", AdminHrStaffPatchView.as_view()),
    path("hr/staff/<int:staff_id>/status/", AdminHrStaffStatusView.as_view()),
    path("hr/staff/<int:staff_id>/leave-balance/", AdminHrStaffLeaveBalanceView.as_view()),
    path("hr/staff/<int:staff_id>/profile-pdf/", AdminHrStaffProfilePdfView.as_view()),
    path("hr/staff/<int:staff_id>/salary-agreement-pdf/", AdminHrSalaryAgreementPdfView.as_view()),
    path("hr/staff-documents/", AdminHrStaffDocumentsListCreateView.as_view()),
    path("hr/staff-documents/<int:document_id>/", AdminHrStaffDocumentPatchView.as_view()),
    path("hr/staff-documents/<int:document_id>/review/", AdminHrStaffDocumentReviewView.as_view()),
    path("hr/attendance/", AdminHrAttendanceListCreateView.as_view()),
    path("hr/leave-requests/", AdminHrLeaveRequestsListCreateView.as_view()),
    path("hr/leave-requests/<int:leave_request_id>/", AdminHrLeaveRequestPatchView.as_view()),
    path("hr/expense-claims/", AdminHrExpenseClaimsListCreateView.as_view()),
    path("hr/expense-claims/<int:expense_claim_id>/", AdminHrExpenseClaimPatchView.as_view()),
    path("hr/payroll/", AdminHrPayrollView.as_view()),
    path("hr/salary-payments/", AdminHrSalaryPaymentsListCreateView.as_view()),
    # Session 4 Consolidation (2026-06-24): HR ViewSet routes (attendance, leave, payroll, expense-claims)
    path("hr/", include(admin_hr_complete.urlpatterns)),
]
