"""Customer refund-request routes.

Only the four endpoints that rest on rules the models already enforce.

The damage-assessment half was held back until the deduction policy existed;
it was set on 2026-09-07 (fixed percentage per condition grade) and is now
mounted below. See api/v1/views/refund_damage.py for what the policy is and
what assessment deliberately does not do.
"""
from django.urls import path

from api.v1.views.customer_refunds import (
    refund_admin_list_view,
    refund_history_view,
    refund_request_view,
    refund_status_view,
)
from api.v1.views.refund_damage import (
    refund_advance_view,
    refund_assess_damage_list_view,
    refund_assess_damage_view,
    refund_inspect_view,
    refund_inspection_jobs_view,
)

urlpatterns = [
    path("request/", refund_request_view, name="refund-request"),
    path("status/<int:request_id>/", refund_status_view, name="refund-status"),
    path("history/", refund_history_view, name="refund-history"),
    path("admin-list/", refund_admin_list_view, name="refund-admin-list"),
    # --- Damage assessment ---
    path(
        "assess-damage/",
        refund_assess_damage_list_view,
        name="refund-assess-damage-list",
    ),
    path(
        "assess-damage/<int:request_id>/",
        refund_assess_damage_view,
        name="refund-assess-damage",
    ),
    path("inspect/<int:request_id>/", refund_inspect_view, name="refund-inspect"),
    path(
        "inspection-jobs/",
        refund_inspection_jobs_view,
        name="refund-inspection-jobs",
    ),
    path("<int:request_id>/advance/", refund_advance_view, name="refund-advance"),
]
