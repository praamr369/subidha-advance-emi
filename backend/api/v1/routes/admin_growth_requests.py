from django.urls import path

from api.v1.views.admin_growth_requests import (
    AdminGrowthRequestApproveView,
    AdminGrowthRequestDetailView,
    AdminGrowthRequestListView,
    AdminGrowthRequestPreviewView,
    AdminGrowthRequestRejectView,
    AdminGrowthRequestSubmitView,
)

urlpatterns = [
    path("growth/requests/", AdminGrowthRequestListView.as_view()),
    path("growth/requests/<int:pk>/", AdminGrowthRequestDetailView.as_view()),
    path("growth/requests/<int:pk>/submit/", AdminGrowthRequestSubmitView.as_view()),
    path("growth/requests/<int:pk>/approve/", AdminGrowthRequestApproveView.as_view()),
    path("growth/requests/<int:pk>/reject/", AdminGrowthRequestRejectView.as_view()),
    path("growth/requests/<int:pk>/preview/", AdminGrowthRequestPreviewView.as_view()),
]
