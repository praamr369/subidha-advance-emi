from django.urls import path

from api.v1.views.contract_amendment_lifecycle import CustomerContractAmendmentWithdrawView
from api.v1.views.contract_amendments import (
    CustomerContractAmendmentDetailView,
    CustomerContractAmendmentListCreateView,
    CustomerContractAmendmentProductRecontractConsentView,
)

urlpatterns = [
    path("contract-amendments/", CustomerContractAmendmentListCreateView.as_view()),
    path("contract-amendments/<int:pk>/", CustomerContractAmendmentDetailView.as_view()),
    path("contract-amendments/<int:pk>/withdraw/", CustomerContractAmendmentWithdrawView.as_view()),
    path(
        "contract-amendments/<int:pk>/product-recontract/consent/",
        CustomerContractAmendmentProductRecontractConsentView.as_view(),
    ),
]
