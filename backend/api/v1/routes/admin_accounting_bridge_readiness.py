from django.urls import path

from api.v1.views.admin_accounting_setup import AccountingSetupStatusView

urlpatterns = [
    path("accounting/bridge-readiness/", AccountingSetupStatusView.as_view()),
]
