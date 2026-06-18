from django.urls import path

from api.v1.views.admin_accounting_close_cockpit import AdminAccountingCloseCockpitView

urlpatterns = [
    path("accounting/close-cockpit/", AdminAccountingCloseCockpitView.as_view()),
]
