from django.urls import path

from api.v1.views.admin_customer_risk import (
    AdminCustomerRiskProfileView,
    AdminCustomerRiskRecalculateView,
)

urlpatterns = [
    path(
        "customers/<int:pk>/risk-profile/",
        AdminCustomerRiskProfileView.as_view(),
        name="admin-customer-risk-profile",
    ),
    path(
        "customers/<int:pk>/risk-profile/recalculate/",
        AdminCustomerRiskRecalculateView.as_view(),
        name="admin-customer-risk-recalculate",
    ),
]
