from django.urls import include, path
from api.v1.routes import crm_analytics as crm_analytics_routes
from api.v1.views.admin_aml import AdminAMLScreeningListView
from api.v1.views.admin_aml import AdminCustomerAMLScreeningView
from api.v1.views.admin_aml import AdminCustomerPEPFlagView
from api.v1.views.admin_aml import AdminKYCRequestReverificationView
from api.v1.views.admin_aml import AdminKYCReverificationQueueView
from api.v1.views.admin_batch_alerts import batch_performance_alert_notify_view
from api.v1.views.admin_batch_alerts import batch_performance_check_view
from api.v1.views.admin_cashier_variance import cashier_variance_escalate_view
from api.v1.views.admin_cashier_variance import cashier_variance_list_view
from api.v1.views.admin_disputes import dispute_detail_view
from api.v1.views.admin_disputes import dispute_escalate_view
from api.v1.views.admin_disputes import dispute_list_create_view
from api.v1.views.admin_disputes import dispute_move_to_review_view
from api.v1.views.admin_disputes import dispute_notify_customer_view
from api.v1.views.admin_disputes import dispute_pending_escalation_view
from api.v1.views.admin_disputes import dispute_sla_breached_view
from api.v1.views.admin_disputes import dispute_sla_status_view
from api.v1.views.admin_finance_complete import cash_flow_statement_view
from api.v1.views.admin_finance_complete import cost_centre_list_view
from api.v1.views.admin_finance_complete import cost_centre_pl_view
from api.v1.views.admin_finance_complete import deferred_tax_list_view
from api.v1.views.admin_finance_complete import depreciation_generate_schedule_view
from api.v1.views.admin_finance_complete import financial_ratios_view
from api.v1.views.admin_finance_complete import fixed_asset_list_create_view
from api.v1.views.admin_finance_complete import fund_flow_statement_view
from api.v1.views.admin_finance_complete import lease_calculate_rou_liability_view
from api.v1.views.admin_finance_complete import lease_contract_list_create_view
from api.v1.views.admin_finance_complete import lease_generate_schedule_view
from api.v1.views.admin_finance_complete import lease_post_to_gl_view
from api.v1.views.admin_finance_gaps import AdminForfeitureInvoiceIssueView
from api.v1.views.admin_finance_gaps import AdminForfeitureInvoiceListView
from api.v1.views.admin_finance_gaps import AdminPaymentReversalActionView
from api.v1.views.admin_finance_gaps import AdminPaymentReversalsView
from api.v1.views.admin_finance_gaps import AdminReconciliationSignOffActionView
from api.v1.views.admin_finance_gaps import AdminReconciliationSignOffListView
from api.v1.views.admin_gstr import AdminGstr2bReconcileView
from api.v1.views.admin_gstr import AdminGstrReportView
from api.v1.views.admin_kyc_notifications import kyc_expiry_notify_view
from api.v1.views.admin_kyc_notifications import kyc_expiry_preview_view
from api.v1.views.admin_partial_payment import partial_payment_preview_view
from api.v1.views.admin_partial_payment import partial_payment_split_view
from api.v1.views.admin_pod import pod_capture_view
from api.v1.views.admin_pod import pod_detail_view
from api.v1.views.admin_pod import pod_export_year_view
from api.v1.views.admin_pod import pod_list_view
from api.v1.views.admin_prepayment import prepayment_calculate_view
from api.v1.views.admin_prepayment import prepayment_list_view
from api.v1.views.admin_prepayment import prepayment_unlock_delivery_view
from api.v1.views.admin_recovery import AdminDefaulterListView
from api.v1.views.admin_recovery import AdminGuarantorDetailView
from api.v1.views.admin_recovery import AdminGuarantorListView
from api.v1.views.admin_recovery import AdminLeaderboardView
from api.v1.views.admin_recovery import AdminRecoveryCaseBulkEscalateView
from api.v1.views.admin_recovery import AdminRecoveryCaseDetailView
from api.v1.views.admin_recovery import AdminRecoveryCaseListView
from api.v1.views.admin_recovery import AdminRecoveryCaseSendLegalNoticeView
from api.v1.views.admin_recovery import AdminRecoveryCaseSendSettlementOfferView
from api.v1.views.admin_recovery import AdminRecoveryCaseSettlementView
from api.v1.views.admin_recovery import AdminSchemeDetailView
from api.v1.views.admin_recovery import AdminSchemeListView
from api.v1.views.admin_recovery import AdminStaffTargetListView
from api.v1.views.admin_scheduled_reports import scheduled_report_export_view
from api.v1.views.admin_scheduled_reports import scheduled_report_types_view
from api.v1.views.admin_unified_payable import AdminUnifiedPayableListView
from api.v1.views.admin_warranty import extended_warranty_list_view
from api.v1.views.admin_warranty import extended_warranty_mark_paid_view
from api.v1.views.admin_warranty import service_pricing_view
from api.v1.views.admin_warranty import warranty_claim_approve_view
from api.v1.views.admin_warranty import warranty_claim_assess_view
from api.v1.views.admin_warranty import warranty_claim_detail_view
from api.v1.views.admin_warranty import warranty_claim_reject_view
from api.v1.views.admin_warranty import warranty_claim_resolve_view
from api.v1.views.admin_warranty import warranty_claims_list_view
from api.v1.views.admin_warranty_coverage import product_warranty_coverage_view
from api.v1.views.admin_warranty_coverage import warranty_dashboard_summary_view
from api.v1.views.admin_warranty_coverage import warranty_invoice_check_view
from api.v1.views.admin_warranty_coverage import warranty_service_record_detail_view
from api.v1.views.admin_warranty_coverage import warranty_service_records_view
from api.v1.views.payables import AdminPayableExecuteView
from api.v1.views.payables import AdminPayableFinanceAccountsView

urlpatterns = [

    # ── GSTR Report + 2B Reconciliation ─────────────────────────────────────
    path("reports/gstr/", AdminGstrReportView.as_view()),
    path("gstr/2b-reconcile/", AdminGstr2bReconcileView.as_view()),

    # ── Defaulter Recovery ────────────────────────────────────────────────────
    path("defaulters/", AdminDefaulterListView.as_view()),
    path("recovery-cases/", AdminRecoveryCaseListView.as_view()),
    path("recovery-cases/bulk-escalate/", AdminRecoveryCaseBulkEscalateView.as_view()),
    path("recovery-cases/<int:pk>/", AdminRecoveryCaseDetailView.as_view()),
    path("recovery-cases/<int:pk>/send-legal-notice/", AdminRecoveryCaseSendLegalNoticeView.as_view()),
    path("recovery-cases/<int:pk>/send-settlement-offer/", AdminRecoveryCaseSendSettlementOfferView.as_view()),
    path("recovery-cases/<int:case_id>/settlement/", AdminRecoveryCaseSettlementView.as_view()),

    # ── AML / KYC re-verification ──────────────────────────────────────────
    path("aml/screenings/", AdminAMLScreeningListView.as_view()),
    path("aml/customers/<int:customer_id>/screenings/", AdminCustomerAMLScreeningView.as_view()),
    path("aml/customers/<int:customer_id>/pep-flag/", AdminCustomerPEPFlagView.as_view()),
    path("kyc/reverification-queue/", AdminKYCReverificationQueueView.as_view()),
    path("kyc/documents/<int:doc_id>/request-reverification/", AdminKYCRequestReverificationView.as_view()),

    # ── Guarantors ────────────────────────────────────────────────────────────
    path("subscriptions/<int:subscription_id>/guarantors/", AdminGuarantorListView.as_view()),
    path("subscriptions/<int:subscription_id>/guarantors/<int:pk>/", AdminGuarantorDetailView.as_view()),

    # ── EMI Schemes ───────────────────────────────────────────────────────────
    path("schemes/", AdminSchemeListView.as_view()),
    path("schemes/<int:pk>/", AdminSchemeDetailView.as_view()),

    # ── Staff targets + leaderboard ───────────────────────────────────────────
    path("crm/staff-targets/", AdminStaffTargetListView.as_view()),
    path("crm/leaderboard/", AdminLeaderboardView.as_view()),

    # ── Advance EMI Prepayment ────────────────────────────────────────────────
    path("subscriptions/<int:subscription_id>/prepayment/calculate/", prepayment_calculate_view),
    path("subscriptions/<int:subscription_id>/prepayment/unlock-delivery/", prepayment_unlock_delivery_view),
    path("prepayments/", prepayment_list_view),

    # ── Proof of Delivery (POD) ───────────────────────────────────────────────
    path("delivery/<int:delivery_id>/pod/capture/", pod_capture_view),
    path("delivery/pod/", pod_list_view),
    path("delivery/pod/<int:pod_id>/", pod_detail_view),
    path("delivery/pod/export/", pod_export_year_view),

    # ── Core Finance: IFRS-16 Lease, Depreciation, Cost Centre, Deferred Tax ──
    path("accounting/subscriptions/<int:subscription_id>/lease/calculate-rou/", lease_calculate_rou_liability_view),
    path("accounting/leases/<int:lease_id>/generate-schedule/", lease_generate_schedule_view),
    path("accounting/leases/<int:lease_id>/post-to-gl/", lease_post_to_gl_view),
    path("accounting/assets/<int:asset_id>/generate-depreciation/", depreciation_generate_schedule_view),
    path("accounting/reports/cost-centre-pl/", cost_centre_pl_view),
    path("accounting/reports/cash-flow/", cash_flow_statement_view),
    path("accounting/reports/fund-flow/", fund_flow_statement_view),
    path("accounting/reports/financial-ratios/", financial_ratios_view),
    path("accounting/deferred-tax/", deferred_tax_list_view),
    # CRUD helpers
    path("accounting/leases/", lease_contract_list_create_view),
    path("accounting/assets/", fixed_asset_list_create_view),
    path("accounting/cost-centres/", cost_centre_list_view),

    # ── KYC expiry notifications ──────────────────────────────────────────────
    path("kyc/expiry-preview/", kyc_expiry_preview_view),
    path("kyc/expiry-notify/", kyc_expiry_notify_view),

    # ── Customer Dispute Workflow ─────────────────────────────────────────────
    path("crm/disputes/", dispute_list_create_view),
    path("crm/disputes/<int:dispute_id>/", dispute_detail_view),
    path("crm/disputes/<int:dispute_id>/notify/", dispute_notify_customer_view),
    path("crm/disputes/<int:dispute_id>/sla-status/", dispute_sla_status_view),
    path("crm/disputes/sla-breached/", dispute_sla_breached_view),
    path("crm/disputes/pending-escalation/", dispute_pending_escalation_view),
    path("crm/disputes/<int:dispute_id>/move-to-review/", dispute_move_to_review_view),
    path("crm/disputes/<int:dispute_id>/escalate/", dispute_escalate_view),
    # Warranty & Service Management
    path("warranty-claims/", warranty_claims_list_view),
    path("warranty-claims/<int:claim_id>/", warranty_claim_detail_view),
    path("warranty-claims/<int:claim_id>/assess/", warranty_claim_assess_view),
    path("warranty-claims/<int:claim_id>/approve/", warranty_claim_approve_view),
    path("warranty-claims/<int:claim_id>/reject/", warranty_claim_reject_view),
    path("warranty-claims/<int:claim_id>/resolve/", warranty_claim_resolve_view),
    path("service-pricing/<int:product_id>/", service_pricing_view),
    path("extended-warranty/", extended_warranty_list_view),
    path("extended-warranty/<int:plan_id>/mark-paid/", extended_warranty_mark_paid_view),
    # Warranty Coverage Management
    path("products/<int:product_id>/warranty-coverage/", product_warranty_coverage_view),
    path("warranty-service-records/", warranty_service_records_view),
    path("warranty-service-records/<int:record_id>/", warranty_service_record_detail_view),
    path("warranty-invoice-check/<int:invoice_id>/", warranty_invoice_check_view),
    path("warranty-dashboard-summary/", warranty_dashboard_summary_view),

    # ── Partial Payment Split ─────────────────────────────────────────────────
    path("subscriptions/<int:subscription_id>/partial-payment/preview/", partial_payment_preview_view),
    path("subscriptions/<int:subscription_id>/partial-payment/split/", partial_payment_split_view),

    # ── Cashier Variance Escalation ───────────────────────────────────────────
    path("cashier/variance/", cashier_variance_list_view),
    path("cashier/day-closes/<int:close_id>/escalate/", cashier_variance_escalate_view),

    # ── Scheduled Report Export ───────────────────────────────────────────────
    path("reports/scheduled-export/types/", scheduled_report_types_view),
    path("reports/scheduled-export/", scheduled_report_export_view),

    # ── Batch Performance Alerts ──────────────────────────────────────────────
    path("batches/performance-check/", batch_performance_check_view),
    path("batches/performance-alert/", batch_performance_alert_notify_view),

    # ── Unified Payable Center ────────────────────────────────────────────────
    path("payables/", AdminUnifiedPayableListView.as_view()),
    path("payables/finance-accounts/", AdminPayableFinanceAccountsView.as_view()),
    path("payables/execute/", AdminPayableExecuteView.as_view()),

    # ── Payment reversal queue ────────────────────────────────────────────────
    path("payments/reversals/", AdminPaymentReversalsView.as_view()),
    path("payments/reversals/<int:pk>/approve/", AdminPaymentReversalActionView.as_view(), kwargs={"action": "approve"}),
    path("payments/reversals/<int:pk>/reject/", AdminPaymentReversalActionView.as_view(), kwargs={"action": "reject"}),

    # ── Reconciliation sign-offs ──────────────────────────────────────────────
    path("finance/reconciliation-signoffs/", AdminReconciliationSignOffListView.as_view()),
    path("finance/reconciliation-signoffs/<int:pk>/sign-off/", AdminReconciliationSignOffActionView.as_view(), kwargs={"action": "sign-off"}),
    path("finance/reconciliation-signoffs/<int:pk>/revoke/", AdminReconciliationSignOffActionView.as_view(), kwargs={"action": "revoke"}),

    # ── Deposit forfeiture invoices ───────────────────────────────────────────
    path("finance/forfeiture-invoices/", AdminForfeitureInvoiceListView.as_view()),
    path("finance/forfeiture-invoices/<int:pk>/issue/", AdminForfeitureInvoiceIssueView.as_view()),

    # ── CRM Analytics ─────────────────────────────────────────────────────────
    path("crm/analytics/", include(crm_analytics_routes.urlpatterns)),
]
