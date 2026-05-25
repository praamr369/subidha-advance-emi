from django.urls import path

from api.v1.views.contract_amendments import (
    CustomerContractAmendmentDetailView,
    CustomerContractAmendmentListCreateView,
)

urlpatterns = [
    path("contract-amendments/", CustomerContractAmendmentListCreateView.as_view()),
    path("contract-amendments/<int:pk>/", CustomerContractAmendmentDetailView.as_view()),
]
