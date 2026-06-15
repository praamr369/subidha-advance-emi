from django.urls import path

from api.v1.views.admin_hr import AdminHrStaffOptionsView

urlpatterns = [
    path("hr/staff/options/", AdminHrStaffOptionsView.as_view(), name="admin-hr-staff-options"),
]
