from django.urls import path

from api.v1.views.admin_growth_offers import (
    AdminOfferPackageDetailView,
    AdminOfferPackageListView,
    AdminOfferPackagePreviewView,
    AdminPlanTemplateDetailView,
    AdminPlanTemplateListView,
)

urlpatterns = [
    path("growth/plan-templates/", AdminPlanTemplateListView.as_view()),
    path("growth/plan-templates/<int:pk>/", AdminPlanTemplateDetailView.as_view()),
    path("growth/offer-packages/", AdminOfferPackageListView.as_view()),
    path("growth/offer-packages/<int:pk>/", AdminOfferPackageDetailView.as_view()),
    path("growth/offer-packages/<int:pk>/preview/", AdminOfferPackagePreviewView.as_view()),
]
