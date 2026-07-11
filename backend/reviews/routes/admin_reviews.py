from django.urls import path
from reviews.views import (
    AdminReviewListView,
    AdminReviewDetailView,
    AdminReviewRefreshCacheView,
    AdminReviewPlatformConfigView,
)

urlpatterns = [
    path("reviews/", AdminReviewListView.as_view()),
    path("reviews/refresh-cache/", AdminReviewRefreshCacheView.as_view()),  # must be before <int:pk>
    path("reviews/platform-config/", AdminReviewPlatformConfigView.as_view()),
    path("reviews/<int:pk>/", AdminReviewDetailView.as_view()),
]
