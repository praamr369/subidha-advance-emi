from django.urls import path

from api.v1.views.admin_partner_performance import (
    AdminPartnerPerformanceDetailView,
    AdminPartnerPerformanceListView,
)

urlpatterns = [
    path("growth/partner-performance/", AdminPartnerPerformanceListView.as_view()),
    path("growth/partner-performance/<int:partner_id>/", AdminPartnerPerformanceDetailView.as_view()),
]
