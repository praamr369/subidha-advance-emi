from django.urls import path

from api.v1.views.admin_customer_timeline import AdminCustomerTimelineView

urlpatterns = [
    path(
        "customers/<int:pk>/timeline/",
        AdminCustomerTimelineView.as_view(),
        name="admin-customer-timeline",
    ),
]
