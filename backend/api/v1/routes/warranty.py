"""Customer-facing warranty routes.

Paths match what the customer portal has called since July 2026. They were
never mounted, so every request 404'd.

Only the customer half is here. The admin warranty surface already exists at
/api/v1/admin/warranty-claims/ and friends — the admin pages call a parallel
set of /api/v1/warranty/* paths (admin-claims, claim/<id>/approve,
service-schedule, service-call/<id>/complete) that duplicate working endpoints.
Those should be repointed in the frontend rather than reimplemented here;
building a second set would leave two implementations of claim approval to keep
in step.
"""
from django.urls import path

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
]
