"""Admin DPDP 2023 back-office routes.

The customer privacy surface shipped in September; this is the half that lets
staff answer it. Until now a customer could file a grievance or a breach could
be logged and there was no endpoint — and no screen — to act on either.

On the duplicate paths: two admin pages exist per concept, one using
`/privacy/...` and one using `/admin/privacy/...`. Both returned 404, so
neither convention is established by use. Each concept is implemented once (in
privacy/views.py) and mounted at both paths; the alternates live in
routes/privacy.py. The duplicate *pages* are still duplicates and one of each
pair should be deleted, but that is a product call, and serving both is
strictly better than serving neither while it is made.
"""
from django.urls import path

from api.v1.views.admin_retention_purge import (
    admin_retention_schedule_action_view,
    admin_retention_schedule_view,
)
from privacy.views import (
    AdminDataBreachActionView,
    AdminDataBreachListView,
    AdminGrievanceListView,
    AdminGrievanceResolveView,
)

urlpatterns = [
    path(
        "grievances/",
        AdminGrievanceListView.as_view(),
        name="admin-privacy-grievances",
    ),
    path(
        "grievances/<int:grievance_id>/resolve/",
        AdminGrievanceResolveView.as_view(),
        name="admin-privacy-grievance-resolve",
    ),
    path(
        "breach-notifications/",
        AdminDataBreachListView.as_view(),
        name="admin-privacy-breach-notifications",
    ),
    # <str:action> rather than a fixed set of paths: the page sends the action
    # as a path segment, and the view validates it against BREACH_ACTIONS so an
    # unknown verb is a 400 with the allowed list, not a 404.
    path(
        "breach-notifications/<int:breach_id>/<str:action>/",
        AdminDataBreachActionView.as_view(),
        name="admin-privacy-breach-notification-action",
    ),
    # Retention purge (CTRL-DPDP-8). Approval-gated and never scheduled — see
    # the module docstring in views/admin_retention_purge.py for why "purge"
    # means anonymise-and-retain-financials rather than delete.
    path(
        "retention-schedule/",
        admin_retention_schedule_view,
        name="admin-privacy-retention-schedule",
    ),
    path(
        "retention-schedule/<int:job_id>/<str:action>/",
        admin_retention_schedule_action_view,
        name="admin-privacy-retention-schedule-action",
    ),
]
