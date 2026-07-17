from django.urls import path
from api.v1.views.workbench import (
    CustomerWorkbenchListView,
    CustomerWorkbenchDetailView,
    AdminWorkbenchListView,
    AdminWorkbenchDetailView,
    WorkbenchAssignView,
    WorkbenchCompleteView,
    WorkbenchCancelView,
    WorkbenchActionListView,
    WorkbenchActionCreateView,
    AdminAssignedItemsView,
)

urlpatterns = [
    # Customer workbench
    path("customer/workbench/", CustomerWorkbenchListView.as_view(), name="customer-workbench-list"),
    path("customer/workbench/<int:pk>/", CustomerWorkbenchDetailView.as_view(), name="customer-workbench-detail"),

    # Admin workbench
    path("admin/workbench/", AdminWorkbenchListView.as_view(), name="admin-workbench-list"),
    path("admin/workbench/<int:pk>/", AdminWorkbenchDetailView.as_view(), name="admin-workbench-detail"),
    path("admin/workbench/assigned/", AdminAssignedItemsView.as_view(), name="admin-workbench-assigned"),

    # Workbench actions
    path("admin/workbench/<int:pk>/assign/", WorkbenchAssignView.as_view(), name="workbench-assign"),
    path("admin/workbench/<int:pk>/complete/", WorkbenchCompleteView.as_view(), name="workbench-complete"),
    path("admin/workbench/<int:pk>/cancel/", WorkbenchCancelView.as_view(), name="workbench-cancel"),
    path("admin/workbench/<int:pk>/actions/", WorkbenchActionListView.as_view(), name="workbench-action-list"),
    path("admin/workbench/<int:pk>/actions/create/", WorkbenchActionCreateView.as_view(), name="workbench-action-create"),
]
