from django.urls import path

from api.v1.views.customers import (
    CustomerProfileSummaryView,
    CustomerQuickCreateView,
    CustomerSearchView,
)

urlpatterns = [
    path("search/", CustomerSearchView.as_view(), name="customers-search"),
    path("create/", CustomerQuickCreateView.as_view(), name="customers-quick-create"),
    path("<int:pk>/profile-summary/", CustomerProfileSummaryView.as_view(), name="customers-profile-summary"),
]
