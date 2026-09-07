"""Customer-facing DPDP 2023 privacy routes.

Paths match what the customer portal has been calling since 2026-07-11. They
were never mounted, so every one of these returned 404 until now; the frontend
is the fixed side of this contract and the routes are shaped to it.
"""
from django.urls import path

from api.v1.views.admin_retention_purge import (
    admin_retention_policy_purge_view,
    admin_retention_schedule_view,
)
from privacy.views import (
    AdminDataBreachListView,
    AdminDataBreachNotifyView,
    AdminGrievanceListView,
    AdminGrievanceResolveView,
    CommunicationPreferencesView,
    ConsentGrantView,
    ConsentListView,
    ConsentWithdrawByIdView,
    ConsentWithdrawView,
    CookieConsentView,
    DataAccessRequestView,
    DataExportView,
    GrievanceView,
    PrivacyAuditLogView,
    PrivacyDashboardSummaryView,
)

urlpatterns = [
    path("consents/", ConsentListView.as_view(), name="privacy-consents"),
    path("consent/grant/", ConsentGrantView.as_view(), name="privacy-consent-grant"),
    path(
        "consent/withdraw/",
        ConsentWithdrawView.as_view(),
        name="privacy-consent-withdraw",
    ),
    path(
        "consent/<int:consent_id>/withdraw/",
        ConsentWithdrawByIdView.as_view(),
        name="privacy-consent-withdraw-by-id",
    ),
    path("cookie-consent/", CookieConsentView.as_view(), name="privacy-cookie-consent"),
    path(
        "data-access-request/",
        DataAccessRequestView.as_view(),
        name="privacy-data-access-request",
    ),
    path("data-export/", DataExportView.as_view(), name="privacy-data-export"),
    path("grievance/", GrievanceView.as_view(), name="privacy-grievance"),
    path(
        "communication-preferences/",
        CommunicationPreferencesView.as_view(),
        name="privacy-communication-preferences",
    ),
    path("audit-log/", PrivacyAuditLogView.as_view(), name="privacy-audit-log"),
    path(
        "dashboard-summary/",
        PrivacyDashboardSummaryView.as_view(),
        name="privacy-dashboard-summary",
    ),
    # --- Admin / back-office, mounted under /privacy/ ---------------------
    # These sit here rather than under /admin/privacy/ only because that is
    # where the older admin pages call them. The canonical paths are in
    # admin_privacy.py; both resolve to the same views.
    path(
        "admin-grievances/",
        AdminGrievanceListView.as_view(),
        name="privacy-admin-grievances",
    ),
    path(
        "grievance/<int:grievance_id>/resolve/",
        AdminGrievanceResolveView.as_view(),
        name="privacy-grievance-resolve",
    ),
    path(
        "data-breaches/",
        AdminDataBreachListView.as_view(),
        name="privacy-data-breaches",
    ),
    path(
        "data-breaches/<int:breach_id>/notify/",
        AdminDataBreachNotifyView.as_view(),
        name="privacy-data-breach-notify",
    ),
    # The older data-retention page's paths. Same views as
    # /admin/privacy/retention-schedule/ — one implementation, two URLs, as
    # with breaches above. "purge" here creates/executes an approval-gated job;
    # it is not a direct delete.
    path(
        "retention-policies/",
        admin_retention_schedule_view,
        name="privacy-retention-policies",
    ),
    path(
        "retention-policies/<int:job_id>/purge/",
        admin_retention_policy_purge_view,
        name="privacy-retention-policy-purge",
    ),
]
