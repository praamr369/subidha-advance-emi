from django.urls import path

from api.v1.views.contract_amendments import (
    AdminContractAmendmentApproveView,
    AdminContractAmendmentDetailView,
    AdminContractAmendmentImplementView,
    AdminContractAmendmentListView,
    AdminContractAmendmentProductRecontractDecisionView,
    AdminContractAmendmentProductRecontractExecuteView,
    AdminContractAmendmentProductRecontractEventListView,
    AdminContractAmendmentProductRecontractFinancialImpactPreviewView,
    AdminContractAmendmentProductRecontractPreviewView,
    AdminContractAmendmentProductRecontractPreviewSaveView,
    AdminContractAmendmentProductRecontractSchedulePreviewView,
    AdminContractAmendmentRejectView,
    AdminContractAmendmentReviewView,
)

urlpatterns = [
    path("contract-amendments/", AdminContractAmendmentListView.as_view()),
    path("contract-amendments/<int:pk>/", AdminContractAmendmentDetailView.as_view()),
    path("contract-amendments/<int:pk>/review/", AdminContractAmendmentReviewView.as_view()),
    path("contract-amendments/<int:pk>/approve/", AdminContractAmendmentApproveView.as_view()),
    path("contract-amendments/<int:pk>/reject/", AdminContractAmendmentRejectView.as_view()),
    path("contract-amendments/<int:pk>/implement/", AdminContractAmendmentImplementView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-preview/", AdminContractAmendmentProductRecontractPreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-preview/save/", AdminContractAmendmentProductRecontractPreviewSaveView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/schedule-preview/", AdminContractAmendmentProductRecontractSchedulePreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/financial-impact-preview/", AdminContractAmendmentProductRecontractFinancialImpactPreviewView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/execute/", AdminContractAmendmentProductRecontractExecuteView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract/admin-decision/", AdminContractAmendmentProductRecontractDecisionView.as_view()),
    path("contract-amendments/<int:pk>/product-recontract-events/", AdminContractAmendmentProductRecontractEventListView.as_view()),
]
