from django.urls import path
from api.v1.views.admin_logistics_cockpit import AdminLogisticsCockpitView

urlpatterns = [
    path("logistics/cockpit/", AdminLogisticsCockpitView.as_view(), name="admin-logistics-cockpit"),
]
