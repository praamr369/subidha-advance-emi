from django.urls import path

from api.v1.views.contract_recontract_accounting import (
    AdminContractAmendmentProductRecontractAccountingPostingView,
)
from api.v1.views.contract_recontract_reconciliation import (
    AdminContractAmendmentProductRecontractReconciliationBridgeView,
)
from api.v1.views.contract_amendments_admin_list import (
    AdminContractAmendmentFilteredListView,
)
from api.v1.views.contract_amendments import (
    AdminContractAmendmentApproveView,
    AdminContractAmendmentDetailView,
    AdminContractAmendmentImplementView,
    AdminContractAmendmentProductRecontractDecisionView,
    AdminContractAmendmentProductRecontractExecuteView,
    AdminContractAmendmentProductRecontractEventListView,
    AdminContractAmendmentProductRecontractFinancialImpactPreviewView,
    AdminContractAmendmentProductRecontractPreviewView,
    AdminContractAmendmentProductRecontractPreviewSaveView,
    AdminContractAmendmentProductRecontractReportView,
    AdminContractAmendmentProductRecontractSchedulePreviewView,
    AdminContractAmendmentRejectView,
    AdminContractAmendmentReviewView,
    AdminContractAmendmentLuckyBatchPreviewView,
    AdminContractAmendmentRentLeasePreviewView,
    AdminContractAmendmentDepositSecurityPreviewView,
)

urlpatterns = [
    path("contract-amendments/", AdminContractAmendmentFilteredListView.as_view()),
    path("contract-amendments/recontract-report/", AdminContractAmendmentProductRecontractReportView.as_view()),
    path("contract-amendments/<int:pk>/", AdminContractAmendmentDetailView.as_view()),
    path("contract-amendments/<int:pk>/review/", AdminContractAmendmentReviewView.as_view()),
    path("contract-amendments/<int:pk>/approve/", AdminContractAmendmentApproveView.as_view()),
    path("contract-amendments/<int:pk>/reject/", AdminContractAmendmentRejectView.as_view()),
    path("contract-amendments/<int:pk>/implement/", AdminContractAmendmentImplementView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-preview/", AdminContractAmendmentProductRecontractPreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-preview/save/", AdminContractAmendmentProductRecontractPreviewSaveView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/schedule-preview/", AdminContractAmendmentProductRecontractSchedulePreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/financial-impact-preview/", AdminContractAmendmentProductRecontractFinancialImpactPreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/accounting-posting/", AdminContractAmendmentProductRecontractAccountingPostingView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/reconciliation-bridge/", AdminContractAmendmentProductRecontractReconciliationBridgeView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/execute/", AdminContractAmendmentProductRecontractExecuteView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/admin-decision/", AdminContractAmendmentProductRecontractDecisionView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-events/", AdminContractAmendmentProductRecontractEventListView.as_view()),
    path("contract-amendments/<int:pk>/lucky-batch-preview/", AdminContractAmendmentLuckyBatchPreviewView.as_view()),
    path("contract-amendments/<int:pk>/rent-lease-preview/", AdminContractAmendmentRentLeasePreviewView.as_view()),
    path("contract-amendments/<int:pk>/deposit-security-preview/", AdminContractAmendmentDepositSecurityPreviewView.as_view()),
]
