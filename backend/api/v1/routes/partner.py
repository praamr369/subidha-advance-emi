from django.urls import path
from api.v1.views.partner_dashboard import (
    PartnerCommissionListView,
    PartnerCustomerListCreateView,
    PartnerDashboardView,
    PartnerSubscriptionListCreateView,
)

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("commissions/", PartnerCommissionListView.as_view()),
    path("customers/", PartnerCustomerListCreateView.as_view()),
    path("subscriptions/", PartnerSubscriptionListCreateView.as_view()),
]
