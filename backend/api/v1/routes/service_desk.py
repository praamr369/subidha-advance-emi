from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.service_desk import (
    ServiceDeskCaseViewSet,
    ServiceDeskComplaintRegisterView,
    ServiceDeskCustomerLookupView,
    ServiceDeskOverviewView,
)
from api.v1.views.service_control_center import (
    AdminServiceControlResolveView,
    AdminServiceControlSearchView,
)

router = DefaultRouter()
router.register(r"cases", ServiceDeskCaseViewSet, basename="service-desk-cases")

urlpatterns = [
    path("overview/", ServiceDeskOverviewView.as_view()),
    path("complaints/", ServiceDeskComplaintRegisterView.as_view()),
    path("control-search/", AdminServiceControlSearchView.as_view()),
    path("control-resolve/", AdminServiceControlResolveView.as_view()),
    path("customer-lookup/", ServiceDeskCustomerLookupView.as_view()),
    path("", include(router.urls)),
]
