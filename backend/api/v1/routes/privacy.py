"""Customer-facing DPDP 2023 privacy routes.

Paths match what the customer portal has been calling since 2026-07-11. They
were never mounted, so every one of these returned 404 until now; the frontend
is the fixed side of this contract and the routes are shaped to it.
"""
from django.urls import path

from privacy.views import (
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
]
