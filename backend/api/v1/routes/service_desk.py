from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.service_desk import (
    ServiceDeskCaseViewSet,
    ServiceDeskComplaintRegisterView,
    ServiceDeskOverviewView,
)

router = DefaultRouter()
router.register(r"cases", ServiceDeskCaseViewSet, basename="service-desk-cases")

urlpatterns = [
    path("overview/", ServiceDeskOverviewView.as_view()),
    path("complaints/", ServiceDeskComplaintRegisterView.as_view()),
    path("", include(router.urls)),
]
