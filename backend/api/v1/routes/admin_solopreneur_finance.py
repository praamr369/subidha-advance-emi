from django.urls import path

from api.v1.views.admin_solopreneur_finance import (
    AdminSolopreneurDailyCloseView,
    AdminSolopreneurLedgerHealthView,
)

urlpatterns = [
    path(
        "accounting/solopreneur-close/",
        AdminSolopreneurDailyCloseView.as_view(),
        name="admin-solopreneur-close",
    ),
    path(
        "accounting/ledger-health/",
        AdminSolopreneurLedgerHealthView.as_view(),
        name="admin-solopreneur-ledger-health",
    ),
]
