from django.urls import path

from api.v1.views.contract_amendments import (
    AdminContractAmendmentApproveView,
    AdminContractAmendmentDetailView,
    AdminContractAmendmentImplementView,
    AdminContractAmendmentListView,
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
]
