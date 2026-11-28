from django.urls import path
from api.v1.views.admin_logistics_cockpit import (
    AdminLogisticsCockpitView,
    AdminTransportFareDetailView,
    AdminTransportFareListCreateView,
)

urlpatterns = [
    path("logistics/cockpit/", AdminLogisticsCockpitView.as_view(), name="admin-logistics-cockpit"),
    path("logistics/transport-fares/", AdminTransportFareListCreateView.as_view(), name="admin-logistics-transport-fares"),
    path("logistics/transport-fares/<int:pk>/", AdminTransportFareDetailView.as_view(), name="admin-logistics-transport-fare-detail"),
]
