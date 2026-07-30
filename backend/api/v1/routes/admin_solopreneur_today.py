from django.urls import path
from api.v1.views.admin_solopreneur_today import AdminSolopreneurTodayView

urlpatterns = [
    path("solopreneur/today/", AdminSolopreneurTodayView.as_view(), name="admin_solopreneur_today"),
]
