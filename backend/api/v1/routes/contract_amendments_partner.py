from django.urls import path

from api.v1.views.contract_amendment_lifecycle import PartnerContractAmendmentWithdrawView
from api.v1.views.contract_amendments import (
    PartnerContractAmendmentDetailView,
    PartnerContractAmendmentListCreateView,
)

urlpatterns = [
    path("contract-amendments/", PartnerContractAmendmentListCreateView.as_view()),
    path("contract-amendments/<int:pk>/", PartnerContractAmendmentDetailView.as_view()),
    path("contract-amendments/<int:pk>/withdraw/", PartnerContractAmendmentWithdrawView.as_view()),
]
