from django.urls import path
from api.v1.views.crm_workbench import (
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
    # Admin workbench
    path("crm/workbench/", AdminWorkbenchListView.as_view(), name="admin-workbench-list"),
    path("crm/workbench/<int:pk>/", AdminWorkbenchDetailView.as_view(), name="admin-workbench-detail"),
    path("crm/workbench/assigned/", AdminAssignedItemsView.as_view(), name="admin-workbench-assigned"),

    # Workbench actions
    path("crm/workbench/<int:pk>/assign/", WorkbenchAssignView.as_view(), name="workbench-assign"),
    path("crm/workbench/<int:pk>/complete/", WorkbenchCompleteView.as_view(), name="workbench-complete"),
    path("crm/workbench/<int:pk>/cancel/", WorkbenchCancelView.as_view(), name="workbench-cancel"),
    path("crm/workbench/<int:pk>/actions/", WorkbenchActionListView.as_view(), name="workbench-action-list"),
    path("crm/workbench/<int:pk>/actions/create/", WorkbenchActionCreateView.as_view(), name="workbench-action-create"),
]
