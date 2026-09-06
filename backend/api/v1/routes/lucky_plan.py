"""Customer-facing lucky plan routes.

Only the three customer views with no existing equivalent. See
api/v1/views/customer_lucky_plan.py for why draw-results, draw-audit and
verify-seed are not mounted here: each duplicates a working endpoint, and in a
cryptographic draw system a second implementation is an integrity problem
rather than tidy-up work. Those stay in api_url_baseline.txt so they remain
counted.
"""
from django.urls import path

from api.v1.views.customer_lucky_plan import (
    lucky_plan_eligibility_view,
    lucky_plan_lucky_id_view,
    lucky_plan_waiver_history_view,
)

urlpatterns = [
    path("eligibility/", lucky_plan_eligibility_view, name="lucky-plan-eligibility"),
    path("lucky-id/", lucky_plan_lucky_id_view, name="lucky-plan-lucky-id"),
    path(
        "waiver-history/",
        lucky_plan_waiver_history_view,
        name="lucky-plan-waiver-history",
    ),
]
