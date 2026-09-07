from django.urls import path

from api.v1.views.admin_collections_queue import (
    admin_collections_due_today_view,
    admin_collections_overdue_view,
    admin_collections_recent_view,
)
from api.v1.views.collection_control_center import AdminCollectionControlCenterView

urlpatterns = [
    path(
        "collections/control-center/",
        AdminCollectionControlCenterView.as_view(),
        name="admin-collections-control-center",
    ),
    # The collector's working queues. Same prefix, different subject: the
    # control centre is about which finance account a payment may post to;
    # these are about who owes money.
    path(
        "collections/due-today/",
        admin_collections_due_today_view,
        name="admin-collections-due-today",
    ),
    path(
        "collections/overdue/",
        admin_collections_overdue_view,
        name="admin-collections-overdue",
    ),
    path(
        "collections/recent/",
        admin_collections_recent_view,
        name="admin-collections-recent",
    ),
]
