from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.manufacturing import (
    ManufacturingBomViewSet,
    ManufacturingOverviewView,
    ProductionJobViewSet,
)

router = DefaultRouter()
router.register(r"boms", ManufacturingBomViewSet, basename="manufacturing-boms")
router.register(r"jobs", ProductionJobViewSet, basename="manufacturing-jobs")

urlpatterns = [
    path("overview/", ManufacturingOverviewView.as_view()),
    path("", include(router.urls)),
]
