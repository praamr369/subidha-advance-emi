from django.urls import path

from api.v1.routes.admin_accounting_bridge_readiness import accounting_bridge_readiness
from api.v1.views.admin_business_setup import AdminSetupReadinessView
from api.v1.views.admin_fresh_start_setup import AdminFreshStartSetupView

urlpatterns = [
    path("setup/readiness/", AdminSetupReadinessView.as_view()),
    path("setup/ensure-fresh-start/", AdminFreshStartSetupView.as_view()),
    path("accounting/bridge-readiness/", accounting_bridge_readiness),
]
