from django.urls import path

from api.v1.views.staff_portal import (
    StaffAttendanceView,
    StaffDashboardView,
    StaffPayslipDetailView,
    StaffPayslipListView,
    StaffProfileView,
    StaffReportsView,
    StaffSalarySummaryView,
    StaffTasksView,
)

urlpatterns = [
    path("dashboard/", StaffDashboardView.as_view(), name="staff-dashboard"),
    path("profile/", StaffProfileView.as_view(), name="staff-profile"),
    path("attendance/", StaffAttendanceView.as_view(), name="staff-attendance"),
    path("payslips/", StaffPayslipListView.as_view(), name="staff-payslips"),
    path("payslips/<int:pk>/", StaffPayslipDetailView.as_view(), name="staff-payslip-detail"),
    path("salary-summary/", StaffSalarySummaryView.as_view(), name="staff-salary-summary"),
    path("reports/", StaffReportsView.as_view(), name="staff-reports"),
    path("tasks/", StaffTasksView.as_view(), name="staff-tasks"),
]
