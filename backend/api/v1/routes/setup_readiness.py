from django.urls import path

from api.v1.views.admin_business_setup import AdminSetupReadinessView

urlpatterns = [
    path("setup/readiness/", AdminSetupReadinessView.as_view()),
]
