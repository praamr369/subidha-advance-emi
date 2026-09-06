"""Repossession back-office routes.

The Repossession model has existed since the consumer-protection work and
encodes real safeguards — a notice, and a response deadline the customer gets
before anything is taken. Nothing was ever mounted, so no screen could show the
queue and the deadline was enforced only by whoever remembered it.
"""
from django.urls import path

from api.v1.views.admin_consumer import (
    admin_repossession_action_view,
    admin_repossessions_view,
)

urlpatterns = [
    path("", admin_repossessions_view, name="admin-repossessions"),
    path(
        "<int:repossession_id>/<str:action>/",
        admin_repossession_action_view,
        name="admin-repossession-action",
    ),
]
