from django.urls import path

from api.v1.views.admin_customer_offers import (
    AdminCustomerOfferCandidatesView,
    AdminCustomerOfferGrantDecisionView,
    AdminCustomerOfferGrantListView,
    AdminCustomerOfferGrantWithdrawView,
    AdminCustomerOfferPendingView,
)

urlpatterns = [
    path("growth/offer-grants/pending/", AdminCustomerOfferPendingView.as_view()),
    path("growth/offer-grants/<int:pk>/decision/", AdminCustomerOfferGrantDecisionView.as_view()),
    path("growth/offer-grants/<int:pk>/withdraw/", AdminCustomerOfferGrantWithdrawView.as_view()),
    path(
        "growth/customers/<int:customer_id>/offer-candidates/",
        AdminCustomerOfferCandidatesView.as_view(),
    ),
    path(
        "growth/customers/<int:customer_id>/offer-grants/",
        AdminCustomerOfferGrantListView.as_view(),
    ),
]
