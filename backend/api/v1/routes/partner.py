from django.urls import path
from api.v1.views.partner_dashboard import (
    PartnerDashboardView,
    PartnerCommissionListView,
)

urlpatterns = [
    path("dashboard/", PartnerDashboardView.as_view()),
    path("commissions/", PartnerCommissionListView.as_view()),
]