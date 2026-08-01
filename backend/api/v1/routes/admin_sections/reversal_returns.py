from django.urls import include, path
from api.v1.views.account_links import AdminCustomerAccountLinkView
from api.v1.views.account_links import AdminPartnerAccountLinkView
from api.v1.views.account_links import AdminPartyAccountLinkView
from api.v1.views.reversal_center import AdminCustomerCreditsView
from api.v1.views.reversal_center import AdminCustomerRefundApproveView
from api.v1.views.reversal_center import AdminCustomerRefundCreateView
from api.v1.views.reversal_center import AdminCustomerRefundPayView
from api.v1.views.reversal_center import AdminCustomerReversalContextView
from api.v1.views.reversal_center import AdminDirectSaleCancelView
from api.v1.views.reversal_center import AdminDirectSaleExchangeCreateView
from api.v1.views.reversal_center import AdminDirectSaleFinalizeReversalView
from api.v1.views.reversal_center import AdminDirectSaleReturnCreateView
from api.v1.views.reversal_center import AdminDirectSaleReturnEligibilityView
from api.v1.views.reversal_center import AdminPurchaseReturnCreateView
from api.v1.views.reversal_center import AdminPurchaseReturnPostView
from api.v1.views.reversal_center import AdminReceiptVoidReasonView
from api.v1.views.reversal_center import AdminReturnApproveView
from api.v1.views.reversal_center import AdminReturnDetailView
from api.v1.views.reversal_center import AdminReturnListView
from api.v1.views.reversal_center import AdminReturnPostView
from api.v1.views.reversal_control import AdminReversalCaseApproveView
from api.v1.views.reversal_control import AdminReversalCaseArchiveView
from api.v1.views.reversal_control import AdminReversalCaseAssignView
from api.v1.views.reversal_control import AdminReversalCaseCloseView
from api.v1.views.reversal_control import AdminReversalCaseDetailView
from api.v1.views.reversal_control import AdminReversalCaseListCreateView
from api.v1.views.reversal_control import AdminReversalCaseNoteView
from api.v1.views.reversal_control import AdminReversalCasePostView
from api.v1.views.reversal_control import AdminReversalCaseReconcileView
from api.v1.views.reversal_control import AdminReversalCaseRejectView
from api.v1.views.reversal_control import AdminReversalCaseSyncView
from api.v1.views.reversal_control import AdminReversalControlDashboardView
from api.v1.views.reversal_control import AdminReversalReconciliationQueueView
from api.v1.views.vendor_ops import AdminCustomerOpeningOutstandingDetailView
from api.v1.views.vendor_ops import AdminCustomerOpeningOutstandingView
from api.v1.views.vendor_ops import AdminFinanceOpeningBalanceView
from api.v1.views.vendor_ops import AdminVendorAccountLinkView
from api.v1.views.vendor_ops import AdminVendorCategoryListCreateView
from api.v1.views.vendor_ops import AdminVendorLedgerView
from api.v1.views.vendor_ops import AdminVendorOpeningBalanceListView
from api.v1.views.vendor_ops import AdminVendorOpeningBalanceView
from api.v1.views.vendor_ops import AdminVendorOutstandingView
from api.v1.views.vendor_ops import AdminVendorProductsView
from api.v1.views.vendor_ops import AdminVendorPurchaseReturnListView
from api.v1.views.vendor_ops import AdminVendorPurchaseReturnsView
from api.v1.views.vendor_ops import AdminVendorPurchasesView
from api.v1.views.vendor_ops import AdminVendorQuoteAcceptView
from api.v1.views.vendor_ops import AdminVendorQuoteRejectView
from api.v1.views.vendor_ops import AdminVendorQuoteRequestDetailView
from api.v1.views.vendor_ops import AdminVendorQuoteRequestListCreateView
from api.v1.views.vendor_ops import AdminVendorSourcingRequestQuotesView
from api.v1.views.vendor_ops import AdminVendorSourcingSuggestView

urlpatterns = [
    path("finance/reversal-control/", AdminReversalControlDashboardView.as_view()),
    path("finance/reversal-cases/", AdminReversalCaseListCreateView.as_view()),
    path("finance/reversal-cases/<int:pk>/", AdminReversalCaseDetailView.as_view()),
    path("finance/reversal-cases/<int:pk>/approve/", AdminReversalCaseApproveView.as_view()),
    path("finance/reversal-cases/<int:pk>/post/", AdminReversalCasePostView.as_view()),
    path("finance/reversal-cases/<int:pk>/reject/", AdminReversalCaseRejectView.as_view()),
    path("finance/reversal-cases/<int:pk>/sync/", AdminReversalCaseSyncView.as_view()),
    path("finance/reversal-cases/<int:pk>/reconcile/", AdminReversalCaseReconcileView.as_view()),
    path("finance/reversal-cases/<int:pk>/assign/", AdminReversalCaseAssignView.as_view()),
    path("finance/reversal-cases/<int:pk>/note/", AdminReversalCaseNoteView.as_view()),
    path("finance/reversal-cases/<int:pk>/close/", AdminReversalCaseCloseView.as_view()),
    path("finance/reversal-cases/<int:pk>/archive/", AdminReversalCaseArchiveView.as_view()),
    path("finance/reversal-reconciliation/", AdminReversalReconciliationQueueView.as_view()),
    path("customers/<int:pk>/account-link/", AdminCustomerAccountLinkView.as_view()),
    path("partners/<int:pk>/account-link/", AdminPartnerAccountLinkView.as_view()),
    path("parties/<int:pk>/account-link/", AdminPartyAccountLinkView.as_view()),
    path("billing/direct-sales/<int:pk>/cancel/", AdminDirectSaleCancelView.as_view()),
    path("billing/direct-sales/<int:pk>/finalize-reversal/", AdminDirectSaleFinalizeReversalView.as_view()),
    path("billing/direct-sales/<int:pk>/returns/", AdminDirectSaleReturnCreateView.as_view()),
    path("billing/direct-sales/<int:pk>/exchange/", AdminDirectSaleExchangeCreateView.as_view()),
    path("billing/direct-sales/<int:pk>/return-eligibility/", AdminDirectSaleReturnEligibilityView.as_view()),
    path("billing/reversal-context/", AdminCustomerReversalContextView.as_view()),
    path("billing/returns/", AdminReturnListView.as_view()),
    path("billing/returns/<int:pk>/", AdminReturnDetailView.as_view()),
    path("billing/returns/<int:pk>/approve/", AdminReturnApproveView.as_view()),
    path("billing/returns/<int:pk>/post/", AdminReturnPostView.as_view()),
    path("billing/receipts/<int:pk>/void/", AdminReceiptVoidReasonView.as_view()),
    path("customers/<int:pk>/credits/", AdminCustomerCreditsView.as_view()),
    path("customers/<int:pk>/refunds/", AdminCustomerRefundCreateView.as_view()),
    path("customers/refunds/<int:pk>/approve/", AdminCustomerRefundApproveView.as_view()),
    path("customers/refunds/<int:pk>/pay/", AdminCustomerRefundPayView.as_view()),
    path("purchases/<int:pk>/returns/", AdminPurchaseReturnCreateView.as_view()),
    path("purchases/returns/<int:pk>/post/", AdminPurchaseReturnPostView.as_view()),
    path("vendors/<int:pk>/ledger/", AdminVendorLedgerView.as_view()),
    path("vendors/<int:pk>/outstanding/", AdminVendorOutstandingView.as_view()),
    path("opening-balances/customers/", AdminCustomerOpeningOutstandingView.as_view()),
    path("opening-balances/customers/<int:pk>/", AdminCustomerOpeningOutstandingDetailView.as_view()),
    path("opening-balances/finance-accounts/<int:pk>/", AdminFinanceOpeningBalanceView.as_view()),
    path("opening-balances/vendors/", AdminVendorOpeningBalanceListView.as_view()),
    path("opening-balances/vendors/<int:pk>/", AdminVendorOpeningBalanceView.as_view()),
    path("vendors/<int:pk>/products/", AdminVendorProductsView.as_view()),
    path("vendors/<int:pk>/purchases/", AdminVendorPurchasesView.as_view()),
    path("vendors/<int:pk>/purchase-returns/", AdminVendorPurchaseReturnsView.as_view()),
    path("vendor-purchase-returns/", AdminVendorPurchaseReturnListView.as_view()),
    path("vendors/categories/", AdminVendorCategoryListCreateView.as_view()),
    path("vendor-sourcing/suggest/", AdminVendorSourcingSuggestView.as_view()),
    path("vendor-sourcing/request-quotes/", AdminVendorSourcingRequestQuotesView.as_view()),
    # Online Enquiries removed - unified CRM pipeline (Phase 1)
    path("vendor-quotes/requests/", AdminVendorQuoteRequestListCreateView.as_view()),
    path("vendor-quotes/requests/<int:pk>/", AdminVendorQuoteRequestDetailView.as_view()),
    path("vendor-quotes/<int:pk>/accept/", AdminVendorQuoteAcceptView.as_view()),
    path("vendor-quotes/<int:pk>/reject/", AdminVendorQuoteRejectView.as_view()),
    path("vendors/<int:pk>/account-link/", AdminVendorAccountLinkView.as_view()),
]
