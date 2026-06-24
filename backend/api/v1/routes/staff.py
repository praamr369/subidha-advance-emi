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
from api.v1.views.staff_kyc import (
    StaffSelfKycAuditTrailView,
    StaffSelfKycDocumentDownloadView,
    StaffSelfKycDocumentListUploadView,
)
from api.v1.views.staff_tasks import (
    StaffTaskCompleteView,
    StaffTaskListView,
)

urlpatterns = [
    path("dashboard/", StaffDashboardView.as_view(), name="staff-dashboard"),
    path("profile/", StaffProfileView.as_view(), name="staff-profile"),
    path("attendance/", StaffAttendanceView.as_view(), name="staff-attendance"),
    path("payslips/", StaffPayslipListView.as_view(), name="staff-payslips"),
    path("payslips/<int:pk>/", StaffPayslipDetailView.as_view(), name="staff-payslip-detail"),
    path("salary-summary/", StaffSalarySummaryView.as_view(), name="staff-salary-summary"),
    path("reports/", StaffReportsView.as_view(), name="staff-reports"),
    path("tasks/", StaffTaskListView.as_view(), name="staff-tasks"),
    path("tasks/<int:pk>/complete/", StaffTaskCompleteView.as_view(), name="staff-task-complete"),
    # KYC self-service (Phase KYC)
    path("kyc/documents/", StaffSelfKycDocumentListUploadView.as_view(), name="staff-kyc-documents"),
    path("kyc/documents/upload/", StaffSelfKycDocumentListUploadView.as_view(), name="staff-kyc-upload"),
    path("kyc/documents/<int:doc_id>/download/", StaffSelfKycDocumentDownloadView.as_view(), name="staff-kyc-download"),
    path("kyc/audit-trail/", StaffSelfKycAuditTrailView.as_view(), name="staff-kyc-audit-trail"),
]
