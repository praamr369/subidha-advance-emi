from django.urls import path
from reviews.views import AdminReviewListView, AdminReviewDetailView, AdminReviewRefreshCacheView

urlpatterns = [
    path("reviews/", AdminReviewListView.as_view()),
    path("reviews/<int:pk>/", AdminReviewDetailView.as_view()),
    path("reviews/refresh-cache/", AdminReviewRefreshCacheView.as_view()),
]
