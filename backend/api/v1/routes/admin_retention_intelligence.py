from django.urls import path

from api.v1.views.admin_retention_intelligence import (
    AdminCustomerRetentionView,
    AdminRetentionListView,
)

urlpatterns = [
    path("growth/retention/", AdminRetentionListView.as_view()),
    path("customers/<int:pk>/retention/", AdminCustomerRetentionView.as_view()),
]
