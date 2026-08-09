from django.urls import include, path
from api.v1.views.admin_money_in_out import AdminMoneyInOutView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestApproveView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestEditView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestFlagView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestListView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestRejectView
from api.v1.views.admin_partner_collection_requests import AdminPartnerCollectionRequestReopenView
from api.v1.views.admin_payout_batches import AdminPayoutBatchCancelView
from api.v1.views.admin_payout_batches import AdminPayoutBatchCreateView
from api.v1.views.admin_payout_batches import AdminPayoutBatchDetailView
from api.v1.views.admin_payout_batches import AdminPayoutBatchExportView
from api.v1.views.admin_payout_batches import AdminPayoutBatchFinalizeView
from api.v1.views.admin_payout_batches import AdminPayoutBatchListView
from api.v1.views.admin_payout_batches import AdminPayoutBatchPreviewView
from api.v1.views.admin_reconciliation import PaymentReconciliationDetailView
from api.v1.views.admin_reconciliation import PaymentReconciliationFlagView
from api.v1.views.admin_reconciliation import PaymentReconciliationListView
from api.v1.views.admin_reconciliation import PaymentReconciliationLockView
from api.v1.views.admin_reconciliation import PaymentReconciliationNoteView
from api.v1.views.admin_reconciliation import PaymentReconciliationUnlockView
from api.v1.views.admin_reports import AdminAnalyticsSummaryView
from api.v1.views.admin_reports import AdminBatchPerformanceAggregateView
from api.v1.views.admin_reports import AdminBatchPerformanceSummaryView
from api.v1.views.admin_reports import AdminEmiAggregateView
from api.v1.views.admin_reports import AdminEmiSummaryView
from api.v1.views.admin_reports import AdminReconciliationAttentionAggregateView
from api.v1.views.admin_reports import AdminRevenueAggregateView
from api.v1.views.admin_reports import AdminRevenueSummaryView
from api.v1.views.billing import AdminDirectSaleFinalizeInvoiceView
from api.v1.views.direct_sale_workspace import AdminBillingProductSearchView
from api.v1.views.direct_sale_workspace import AdminDirectSalePreviewView
from api.v1.views.direct_sale_workspace import AdminInventoryRequirementListView
from api.v1.views.phase4_finance import AdminCustomerStatementView
from api.v1.views.phase4_finance import AdminDocumentCenterView
from api.v1.views.phase4_finance import AdminDocumentRegenerateView
from api.v1.views.phase4_finance import AdminInvoicePdfView
from api.v1.views.phase4_finance import AdminInvoiceRegisterView
from api.v1.views.phase4_finance import AdminReceiptPdfView
from api.v1.views.phase4_finance import AdminReceiptRegisterView
from api.v1.views.views.audit_views import AdminBusinessEventLogDetailView
from api.v1.views.views.audit_views import AdminBusinessEventLogListView
from api.v1.views.views.audit_views import AuditLogDetailView
from api.v1.views.views.audit_views import AuditLogListView
from api.v1.views.views.audit_views import AuditObjectTimelineView
from api.v1.views.views.audit_views import financial_audit_report

urlpatterns = [
    path("invoices/", AdminInvoiceRegisterView.as_view()),
    path("invoices/<int:pk>/pdf/", AdminInvoicePdfView.as_view()),
    path("billing/products/search/", AdminBillingProductSearchView.as_view()),
    # Deprecated alias: keep for backward compatibility during route migration.
    path("billing/product-search/", AdminBillingProductSearchView.as_view()),
    path("direct-sales/preview/", AdminDirectSalePreviewView.as_view()),
    path("billing/direct-sales/<int:pk>/finalize-invoice/", AdminDirectSaleFinalizeInvoiceView.as_view()),
    path("inventory/requirements/", AdminInventoryRequirementListView.as_view()),
    path("receipts/", AdminReceiptRegisterView.as_view()),
    path("receipts/<int:pk>/pdf/", AdminReceiptPdfView.as_view()),
    path("documents/", AdminDocumentCenterView.as_view()),
    path("documents/<int:pk>/regenerate/", AdminDocumentRegenerateView.as_view()),
    path("customer/<int:pk>/statement/", AdminCustomerStatementView.as_view()),
    path("commission-payout-batches/", AdminPayoutBatchCreateView.as_view()),
    path("commission-payout-batches/list/", AdminPayoutBatchListView.as_view()),
    path("commission-payout-batches/preview/", AdminPayoutBatchPreviewView.as_view()),
    path("commission-payout-batches/<int:pk>/", AdminPayoutBatchDetailView.as_view()),
    path("commission-payout-batches/<int:pk>/export/", AdminPayoutBatchExportView.as_view()),
    path("commission-payout-batches/<int:pk>/finalize/", AdminPayoutBatchFinalizeView.as_view()),
    path("commission-payout-batches/<int:pk>/cancel/", AdminPayoutBatchCancelView.as_view()),
    path("reconciliations/", PaymentReconciliationListView.as_view()),
    path("reconciliations/<int:pk>/", PaymentReconciliationDetailView.as_view()),
    path("reconciliations/<int:pk>/flag/", PaymentReconciliationFlagView.as_view()),
    path("reconciliations/<int:pk>/note/", PaymentReconciliationNoteView.as_view()),
    path("reconciliations/<int:pk>/lock/", PaymentReconciliationLockView.as_view()),
    path("reconciliations/<int:pk>/unlock/", PaymentReconciliationUnlockView.as_view()),
    path("audit-logs/", AuditLogListView.as_view(), name="admin-audit-log-list"),
    path("audit-logs/<int:pk>/", AuditLogDetailView.as_view(), name="admin-audit-log-detail"),
    path("audit-logs/timeline/<str:model_name>/<str:object_id>/", AuditObjectTimelineView.as_view(), name="admin-audit-object-timeline"),
    path("audit-logs/financial-report/", financial_audit_report, name="admin-financial-audit-report"),
    path("audit/events/", AdminBusinessEventLogListView.as_view(), name="admin-business-event-list"),
    path("audit/events/<int:pk>/", AdminBusinessEventLogDetailView.as_view(), name="admin-business-event-detail"),
    path("collection-requests/", AdminPartnerCollectionRequestListView.as_view()),
    path("collection-requests/<int:pk>/approve/", AdminPartnerCollectionRequestApproveView.as_view()),
    path("collection-requests/<int:pk>/reject/", AdminPartnerCollectionRequestRejectView.as_view()),
    path("collection-requests/<int:pk>/flag/", AdminPartnerCollectionRequestFlagView.as_view()),
    path("collection-requests/<int:pk>/reopen/", AdminPartnerCollectionRequestReopenView.as_view()),
    path("collection-requests/<int:pk>/edit/", AdminPartnerCollectionRequestEditView.as_view()),
    path("reports/revenue-aggregate/", AdminRevenueAggregateView.as_view()),
    path("reports/revenue-summary/", AdminRevenueSummaryView.as_view()),
    path("reports/emi-aggregate/", AdminEmiAggregateView.as_view()),
    path("reports/emi-summary/", AdminEmiSummaryView.as_view()),
    path("reports/batch-performance-aggregate/", AdminBatchPerformanceAggregateView.as_view()),
    path("reports/batch-performance/", AdminBatchPerformanceSummaryView.as_view()),
    path("reports/reconciliation-attention/", AdminReconciliationAttentionAggregateView.as_view()),
    path("reports/analytics-summary/", AdminAnalyticsSummaryView.as_view()),
    path("reports/money-in-out/", AdminMoneyInOutView.as_view()),
]
