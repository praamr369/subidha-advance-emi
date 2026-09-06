"""Consumer-protection back-office routes (CTRL-CONS-1, CTRL-CONS-3).

Paths match what the admin consumer pages have called since July 2026. Nothing
mounted them, so a customer could have a return request sitting in the database
with a running statutory refund deadline and no staff screen could show it.
"""
from django.urls import path

from api.v1.views.admin_consumer import (
    admin_defect_claim_action_view,
    admin_defect_claims_view,
    admin_return_request_action_view,
    admin_return_request_cpa_override_view,
    admin_return_requests_view,
)

urlpatterns = [
    path(
        "defect-claims/",
        admin_defect_claims_view,
        name="admin-consumer-defect-claims",
    ),
    path(
        "defect-claims/<int:claim_id>/<str:action>/",
        admin_defect_claim_action_view,
        name="admin-consumer-defect-claim-action",
    ),
    path(
        "return-requests/",
        admin_return_requests_view,
        name="admin-consumer-return-requests",
    ),
    # Registered BEFORE the generic <str:action> route. Django resolves in
    # order, so the generic pattern would otherwise swallow "cpa-override" and
    # route it to the action view, which would reject it as unknown.
    path(
        "return-requests/<int:request_id>/cpa-override/",
        admin_return_request_cpa_override_view,
        name="admin-consumer-return-cpa-override",
    ),
    path(
        "return-requests/<int:request_id>/<str:action>/",
        admin_return_request_action_view,
        name="admin-consumer-return-action",
    ),
]
