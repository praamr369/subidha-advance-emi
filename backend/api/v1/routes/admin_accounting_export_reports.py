from django.urls import path

from api.v1.views.admin_accounting_export_reports import (
    AdminAccountingBridgeAuditExportView,
    AdminAccountingExportIndexView,
    AdminAccountingJournalExportView,
    AdminAccountingLedgerExportView,
    AdminAccountingLiabilityExportView,
    AdminAccountingReceivablesExportView,
    AdminAccountingTrialBalanceExportView,
)

urlpatterns = [
    path("accounting/exports/", AdminAccountingExportIndexView.as_view()),
    path("accounting/exports/trial-balance/", AdminAccountingTrialBalanceExportView.as_view()),
    path("accounting/exports/journals/", AdminAccountingJournalExportView.as_view()),
    path("accounting/exports/ledgers/", AdminAccountingLedgerExportView.as_view()),
    path("accounting/exports/receivables/", AdminAccountingReceivablesExportView.as_view()),
    path("accounting/exports/liabilities/", AdminAccountingLiabilityExportView.as_view()),
    path("accounting/exports/bridge-audit/", AdminAccountingBridgeAuditExportView.as_view()),
]
