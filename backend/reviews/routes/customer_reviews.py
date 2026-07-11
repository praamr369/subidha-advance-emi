from django.urls import path
from reviews.views import CustomerReviewListView

urlpatterns = [
    path("reviews/", CustomerReviewListView.as_view()),
]
