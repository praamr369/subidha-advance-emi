from django.urls import include, path
from api.v1.views.admin_commissions import AdminCommissionBulkSettleView
from api.v1.views.admin_commissions import AdminCommissionListView
from api.v1.views.admin_commissions import AdminCommissionReconciliationView
from api.v1.views.admin_commissions import AdminCommissionSettleView
from api.v1.views.admin_commissions import AdminCommissionStatementExportView
from api.v1.views.admin_commissions import AdminCommissionSummaryView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationItemDetailView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationItemListView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationItemReopenView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationItemResolveView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationModulesView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationRunChecksView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationRunDetailView
from api.v1.views.admin_reconciliation_control_tower import AdminReconciliationRunListCreateView
from api.v1.views.finance_operations import AdminAdvanceAllocationView
from api.v1.views.finance_operations import AdminFinanceAccountOperationalSummaryView
from api.v1.views.finance_operations import AdminFinanceTransferView
from api.v1.views.finance_operations import AdminMoneyInHandView
from api.v1.views.finance_operations import AdminReconciliationOverviewView
from api.v1.views.phase4_finance import AdminFinanceAccountMappingView
from api.v1.views.phase4_finance import AdminFinanceCollectionsView
from api.v1.views.phase4_finance import AdminFinanceDashboardView
from api.v1.views.phase4_finance import AdminFinanceDepositDeductionPdfView
from api.v1.views.phase4_finance import AdminFinanceDepositDeductionView
from api.v1.views.phase4_finance import AdminFinanceDepositPdfView
from api.v1.views.phase4_finance import AdminFinanceDepositRefundApproveView
from api.v1.views.phase4_finance import AdminFinanceDepositRefundPdfView
from api.v1.views.phase4_finance import AdminFinanceDepositRefundRecordView
from api.v1.views.phase4_finance import AdminFinanceDepositRegisterView
from api.v1.views.phase4_finance import AdminFinanceDuesView
from api.v1.views.phase4_finance import AdminFinanceOverdueView
from api.v1.views.phase4_finance import AdminFinanceReconciliationView
from api.v1.views.phase4_finance import AdminFinanceWaiverLossView

urlpatterns = [
    path("", include("api.v1.routes.admin_password_reset_requests")),
    path("commissions/<int:pk>/settle/", AdminCommissionSettleView.as_view()),
    path("commissions/", AdminCommissionListView.as_view()),
    path("commissions/summary/", AdminCommissionSummaryView.as_view()),
    path("commissions/reconciliation/", AdminCommissionReconciliationView.as_view()),
    path("commissions/statements/export/", AdminCommissionStatementExportView.as_view()),
    path("commissions/bulk-settle/", AdminCommissionBulkSettleView.as_view()),
    path("payments/allocate-advance/", AdminAdvanceAllocationView.as_view()),
    path("finance-transfers/", AdminFinanceTransferView.as_view()),
    path("reconciliation/overview/", AdminReconciliationOverviewView.as_view()),
    path("reconciliation/modules/", AdminReconciliationModulesView.as_view()),
    path("reconciliation/runs/run-checks/", AdminReconciliationRunChecksView.as_view()),
    path("reconciliation/runs/", AdminReconciliationRunListCreateView.as_view()),
    path("reconciliation/runs/<int:pk>/", AdminReconciliationRunDetailView.as_view()),
    path("reconciliation/items/", AdminReconciliationItemListView.as_view()),
    path("reconciliation/items/<int:pk>/", AdminReconciliationItemDetailView.as_view()),
    path("reconciliation/items/<int:pk>/resolve/", AdminReconciliationItemResolveView.as_view()),
    path("reconciliation/items/<int:pk>/reopen/", AdminReconciliationItemReopenView.as_view()),
    path("finance-accounts/operational-summary/", AdminFinanceAccountOperationalSummaryView.as_view()),
    path("finance/money-in-hand/", AdminMoneyInHandView.as_view()),
    # Phase 4: finance dashboard + registers + document center
    path("finance/dashboard/", AdminFinanceDashboardView.as_view()),
    path("finance/collections/", AdminFinanceCollectionsView.as_view()),
    path("finance/dues/", AdminFinanceDuesView.as_view()),
    path("finance/overdue/", AdminFinanceOverdueView.as_view()),
    path("finance/reconciliation/", AdminFinanceReconciliationView.as_view()),
    path("finance/waiver-loss/", AdminFinanceWaiverLossView.as_view()),
    path("finance/deposits/", AdminFinanceDepositRegisterView.as_view()),
    path("finance/deposits/<int:pk>/pdf/", AdminFinanceDepositPdfView.as_view()),
    path("finance/deposits/<int:pk>/refund-pdf/", AdminFinanceDepositRefundPdfView.as_view()),
    path("finance/deposits/<int:pk>/deduction-pdf/", AdminFinanceDepositDeductionPdfView.as_view()),
    path("finance/deposits/deduct/", AdminFinanceDepositDeductionView.as_view()),
    path("finance/deposits/refund-approve/", AdminFinanceDepositRefundApproveView.as_view()),
    path("finance/deposits/refund/", AdminFinanceDepositRefundRecordView.as_view()),
    path("finance/account-mapping/", AdminFinanceAccountMappingView.as_view()),
]
