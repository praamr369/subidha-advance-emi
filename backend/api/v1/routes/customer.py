from django.urls import path

from api.v1.views.customer import (
    CustomerDashboard,
    CustomerDeliveryDetailView,
    CustomerDeliveryListView,
    CustomerPaymentDetailView,
    CustomerPaymentListView,
    CustomerProfileView,
    CustomerSupportRequestDetailView,
    CustomerSupportRequestListCreateView,
    CustomerSubscriptionDetailView,
)
from api.v1.views.paginated_registers import PaginatedCustomerSubscriptionListView

urlpatterns = [
    path("dashboard/", CustomerDashboard.as_view()),
    path("profile/", CustomerProfileView.as_view()),
    path("subscriptions/", PaginatedCustomerSubscriptionListView.as_view()),
    path("subscriptions/<int:pk>/", CustomerSubscriptionDetailView.as_view()),
    path("deliveries/", CustomerDeliveryListView.as_view()),
    path("deliveries/<int:pk>/", CustomerDeliveryDetailView.as_view()),
    path("payments/", CustomerPaymentListView.as_view()),
    path("payments/<int:pk>/", CustomerPaymentDetailView.as_view()),
    path("support-requests/", CustomerSupportRequestListCreateView.as_view()),
    path("support-requests/<int:pk>/", CustomerSupportRequestDetailView.as_view()),
]
