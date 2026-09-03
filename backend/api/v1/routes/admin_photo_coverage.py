from django.urls import path

from api.v1.views.admin_photo_coverage import AdminPhotoCoverageView

urlpatterns = [
    path("pim/photo-coverage/", AdminPhotoCoverageView.as_view()),
]
