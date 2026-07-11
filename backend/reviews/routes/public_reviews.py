from django.urls import path
from reviews.views import PublicReviewsView, PublicReviewSubmitView

urlpatterns = [
    path("reviews/", PublicReviewsView.as_view()),
    path("reviews/submit/", PublicReviewSubmitView.as_view()),
]
