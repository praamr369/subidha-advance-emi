from django.urls import path
from api.v1.views.emi_analytics import BatchAnalyticsView

urlpatterns = [
    path("batch/<int:batch_id>/analytics/",
         BatchAnalyticsView.as_view()),
]