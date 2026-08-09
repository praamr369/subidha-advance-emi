from django.urls import include, path
from api.v1.views.admin_operations_queues import AdminOperationsNextActionsView
from api.v1.views.admin_operations_queues import AdminOperationsQueueSummaryView
from api.v1.views.admin_operations_queues import AdminOperationsRequestQueuesView
from api.v1.views.admin_operations_queues import AdminPartnerOperationsSummaryView
from api.v1.views.admin_operations_queues import AdminPartnerPaymentRequestsView
from api.v1.views.admin_phase5_control import AdminAccountingAuditTrailView
from api.v1.views.admin_phase5_control import AdminAccountingCashBankSummaryView
from api.v1.views.admin_phase5_control import AdminAccountingChartSummaryView
from api.v1.views.admin_phase5_control import AdminAccountingControlCenterView
from api.v1.views.admin_phase5_control import AdminAccountingDepositLiabilityView
from api.v1.views.admin_phase5_control import AdminAccountingLedgerSummaryView
from api.v1.views.admin_phase5_control import AdminAccountingPayablesView
from api.v1.views.admin_phase5_control import AdminAccountingPaymentMethodSplitView
from api.v1.views.admin_phase5_control import AdminAccountingReceivablesView
from api.v1.views.admin_phase5_control import AdminAccountingReconciliationAttachReferenceView
from api.v1.views.admin_phase5_control import AdminAccountingReconciliationControlView
from api.v1.views.admin_phase5_control import AdminAccountingReconciliationMarkReconciledView
from api.v1.views.admin_phase5_control import AdminAccountingReconciliationMarkUnreconciledView
from api.v1.views.admin_phase5_control import AdminAccountingRevenueBreakdownView
from api.v1.views.admin_phase5_control import AdminAccountingUnreconciledView
from api.v1.views.admin_phase5_control import AdminAccountingWaiverLossView
from api.v1.views.admin_phase5_control import AdminOperationsAlertsView
from api.v1.views.admin_phase5_control import AdminOperationsCommandCenterView
from api.v1.views.admin_phase5_control import AdminOperationsContractsView
from api.v1.views.admin_phase5_control import AdminOperationsCrmView
from api.v1.views.admin_phase5_control import AdminOperationsDeliveriesView
from api.v1.views.admin_phase5_control import AdminOperationsInventoryView
from api.v1.views.admin_phase5_control import AdminOperationsPartnersView
from api.v1.views.admin_phase5_control import AdminOperationsPendingApprovalsView
from api.v1.views.admin_phase5_control import AdminOperationsReturnsView
from api.v1.views.admin_phase5_control import AdminOperationsTodayView
from api.v1.views.admin_phase5_control import AdminOperationsWorkQueueView

urlpatterns = [
    # Phase 5: accounting control center
    path("accounting/control-center/", AdminAccountingControlCenterView.as_view()),
    path("accounting/chart-summary/", AdminAccountingChartSummaryView.as_view()),
    path("accounting/ledger-summary/", AdminAccountingLedgerSummaryView.as_view()),
    path("accounting/cash-bank-summary/", AdminAccountingCashBankSummaryView.as_view()),
    path("accounting/receivables/", AdminAccountingReceivablesView.as_view()),
    path("accounting/payables/", AdminAccountingPayablesView.as_view()),
    path("accounting/reconciliation-control/", AdminAccountingReconciliationControlView.as_view()),
    path("accounting/unreconciled/", AdminAccountingUnreconciledView.as_view()),
    path("accounting/waiver-loss/", AdminAccountingWaiverLossView.as_view()),
    path("accounting/deposit-liability/", AdminAccountingDepositLiabilityView.as_view()),
    path("accounting/revenue-breakdown/", AdminAccountingRevenueBreakdownView.as_view()),
    path("accounting/payment-method-split/", AdminAccountingPaymentMethodSplitView.as_view()),
    path("accounting/audit-trail/", AdminAccountingAuditTrailView.as_view()),
    path("accounting/reconciliation/<int:pk>/mark-reconciled/", AdminAccountingReconciliationMarkReconciledView.as_view()),
    path("accounting/reconciliation/<int:pk>/mark-unreconciled/", AdminAccountingReconciliationMarkUnreconciledView.as_view()),
    path("accounting/reconciliation/<int:pk>/attach-reference/", AdminAccountingReconciliationAttachReferenceView.as_view()),
    # Phase 5: operations command center
    path("operations/command-center/", AdminOperationsCommandCenterView.as_view()),
    path("operations/alerts/", AdminOperationsAlertsView.as_view()),
    path("operations/work-queue/", AdminOperationsWorkQueueView.as_view()),
    path("operations/pending-approvals/", AdminOperationsPendingApprovalsView.as_view()),
    path("operations/today/", AdminOperationsTodayView.as_view()),
    path("operations/contracts/", AdminOperationsContractsView.as_view()),
    path("operations/deliveries/", AdminOperationsDeliveriesView.as_view()),
    path("operations/returns/", AdminOperationsReturnsView.as_view()),
    path("operations/inventory/", AdminOperationsInventoryView.as_view()),
    path("operations/partners/", AdminOperationsPartnersView.as_view()),
    path("operations/crm/", AdminOperationsCrmView.as_view()),
    path("operations/queue-summary/", AdminOperationsQueueSummaryView.as_view()),
    path("operations/next-actions/", AdminOperationsNextActionsView.as_view()),
    path("operations/request-queues/", AdminOperationsRequestQueuesView.as_view()),
    path("partner-operations/summary/", AdminPartnerOperationsSummaryView.as_view()),
    path("partner-payment-requests/", AdminPartnerPaymentRequestsView.as_view()),
]
