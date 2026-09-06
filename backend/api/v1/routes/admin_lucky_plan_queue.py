"""Lucky-plan back-office routes: the draw authorisation queue.

Mounted under /admin/lucky-plan/ to match what the admin page calls. The
existing /admin/lucky-draws/ viewset covers draws themselves; this covers the
two-person control that has to pass before one runs.
"""
from django.urls import path

from api.v1.views.admin_lucky_plan_queue import (
    admin_draw_authorisation_action_view,
    admin_draw_authorisations_view,
    admin_waiver_settlements_view,
)

urlpatterns = [
    path(
        "draw-authorisations/",
        admin_draw_authorisations_view,
        name="admin-lucky-draw-authorisations",
    ),
    path(
        "draw-authorisations/<int:authorisation_id>/<str:action>/",
        admin_draw_authorisation_action_view,
        name="admin-lucky-draw-authorisation-action",
    ),
    path(
        "waiver-settlements/",
        admin_waiver_settlements_view,
        name="admin-lucky-waiver-settlements",
    ),
]
