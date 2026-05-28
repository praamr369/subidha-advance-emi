from django.urls import path

from api.v1.views.collection_control_center import AdminCollectionControlCenterView

urlpatterns = [
    path(
        "collections/control-center/",
        AdminCollectionControlCenterView.as_view(),
        name="admin-collections-control-center",
    ),
]
