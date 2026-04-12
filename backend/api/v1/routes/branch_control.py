from django.urls import include, path
from rest_framework.routers import DefaultRouter

from api.v1.views.branch_control import (
    BranchImportPostView,
    BranchImportPreviewView,
    BranchReportingOverviewView,
    BranchViewSet,
    CounterImportPostView,
    CounterImportPreviewView,
    CashCounterViewSet,
)

router = DefaultRouter()
router.register(r"branches", BranchViewSet, basename="branch-control-branches")
router.register(r"counters", CashCounterViewSet, basename="branch-control-counters")

urlpatterns = [
    path("imports/branches/preview/", BranchImportPreviewView.as_view()),
    path("imports/branches/post/", BranchImportPostView.as_view()),
    path("imports/counters/preview/", CounterImportPreviewView.as_view()),
    path("imports/counters/post/", CounterImportPostView.as_view()),
    path("reporting/overview/", BranchReportingOverviewView.as_view()),
    path("", include(router.urls)),
]
