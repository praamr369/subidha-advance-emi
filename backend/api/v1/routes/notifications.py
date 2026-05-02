from django.urls import path

from api.v1.views.notifications import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationSummaryView,
)

urlpatterns = [
    path("", NotificationListView.as_view()),
    path("summary/", NotificationSummaryView.as_view()),
    path("mark-all-read/", NotificationMarkAllReadView.as_view()),
    path("<int:pk>/read/", NotificationMarkReadView.as_view()),
]
