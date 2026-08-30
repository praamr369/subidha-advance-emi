from django.urls import path
from .views import (
    PublicReviewListView,
    SubmitReviewView,
    AdminReviewListView,
    AdminReviewDetailView,
    AdminReviewSyncView,
)

urlpatterns = [
    path("", PublicReviewListView.as_view(), name="reviews-public-list"),
    path("submit/", SubmitReviewView.as_view(), name="reviews-submit"),
    path("admin/", AdminReviewListView.as_view(), name="reviews-admin-list"),
    path("admin/<int:pk>/", AdminReviewDetailView.as_view(), name="reviews-admin-detail"),
    path("admin/<int:pk>/sync/", AdminReviewSyncView.as_view(), name="reviews-admin-sync"),
]
