"""Customer-facing warranty routes.

Paths match what the customer portal has called since July 2026. They were
never mounted, so every request 404'd.

The admin pages call a parallel set of /api/v1/warranty/* paths, and those split
two ways — an earlier note in this file wrongly treated them as one group:

  * admin-claims/ and claim/<id>/approve/ DO duplicate working endpoints
    (/api/v1/admin/warranty-claims/ and its approve/ action). They are
    repointed in the frontend, not reimplemented — a second implementation of
    claim approval is two things to keep in step.

  * service-schedule/, claim/<id>/schedule/ and service-call/<id>/complete/
    duplicate nothing. No scheduling endpoint has ever existed, which left an
    approved claim with nowhere to go. Those are implemented, at the bottom of
    this file.
"""
from django.urls import path

from api.v1.views.admin_warranty_schedule import (
    warranty_claim_schedule_view,
    warranty_service_call_complete_view,
    warranty_service_schedule_view,
)
from api.v1.views.customer_warranty import (
    warranty_check_view,
    warranty_claim_create_view,
    warranty_claim_status_view,
    warranty_enroll_extended_view,
    warranty_extended_plans_view,
    warranty_service_history_view,
)

urlpatterns = [
    path("check/<int:product_id>/", warranty_check_view, name="warranty-check"),
    path("claim/", warranty_claim_create_view, name="warranty-claim-create"),
    path(
        "claim-status/<int:claim_id>/",
        warranty_claim_status_view,
        name="warranty-claim-status",
    ),
    path(
        "service-history/",
        warranty_service_history_view,
        name="warranty-service-history",
    ),
    path(
        "extended-plans/<int:product_id>/",
        warranty_extended_plans_view,
        name="warranty-extended-plans",
    ),
    path(
        "enroll-extended/",
        warranty_enroll_extended_view,
        name="warranty-enroll-extended",
    ),
    # --- Staff service scheduling -----------------------------------------
    # Admin-only despite sitting under /warranty/; the permission class is on
    # the views. They live here because that is where the service-schedule
    # page has been calling since July 2026.
    path(
        "service-schedule/",
        warranty_service_schedule_view,
        name="warranty-service-schedule",
    ),
    path(
        "claim/<int:claim_id>/schedule/",
        warranty_claim_schedule_view,
        name="warranty-claim-schedule",
    ),
    path(
        "service-call/<int:claim_id>/complete/",
        warranty_service_call_complete_view,
        name="warranty-service-call-complete",
    ),
]
