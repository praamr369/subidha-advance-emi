from django.urls import path

from api.v1.views.admin_migration_center import (
    MigrationAuditLogView, MigrationBatchDetailView, MigrationBatchListView,
    MigrationBatchRowsView, MigrationDuplicatesView, MigrationErrorReportView,
    MigrationExecuteView, MigrationMappingRulesView, MigrationMappingView,
    MigrationOverviewView, MigrationPreviewView, MigrationReadinessView,
    MigrationReconciliationReportView, MigrationReconciliationView,
    MigrationRollbackView, MigrationRowDetailView, MigrationTemplateDownloadView,
    MigrationUploadView, MigrationValidateView, MigrationWorkbenchAdoptView,
    MigrationWorkbenchCreateView,
)

urlpatterns = [
    path("migration/overview/", MigrationOverviewView.as_view()),
    path("migration/templates/<str:dataset_key>/", MigrationTemplateDownloadView.as_view()),
    path("migration/upload/", MigrationUploadView.as_view()),
    path("migration/workbench/", MigrationWorkbenchCreateView.as_view()),
    path("migration/batches/", MigrationBatchListView.as_view()),
    path("migration/batches/<int:batch_id>/", MigrationBatchDetailView.as_view()),
    path("migration/batches/<int:batch_id>/rows/", MigrationBatchRowsView.as_view()),
    path("migration/batches/<int:batch_id>/rows/<int:row_number>/", MigrationRowDetailView.as_view()),
    path("migration/batches/<int:batch_id>/adopt-workbench/", MigrationWorkbenchAdoptView.as_view()),
    path("migration/batches/<int:batch_id>/mapping/", MigrationMappingView.as_view()),
    path("migration/batches/<int:batch_id>/validate/", MigrationValidateView.as_view()),
    path("migration/batches/<int:batch_id>/duplicates/", MigrationDuplicatesView.as_view()),
    path("migration/batches/<int:batch_id>/preview/", MigrationPreviewView.as_view()),
    path("migration/batches/<int:batch_id>/execute/", MigrationExecuteView.as_view()),
    path("migration/batches/<int:batch_id>/rollback/", MigrationRollbackView.as_view()),
    path("migration/batches/<int:batch_id>/reconcile/", MigrationReconciliationView.as_view()),
    path("migration/batches/<int:batch_id>/error-report/", MigrationErrorReportView.as_view()),
    path("migration/batches/<int:batch_id>/reconciliation-report/", MigrationReconciliationReportView.as_view()),
    path("migration/mapping-rules/", MigrationMappingRulesView.as_view()),
    path("migration/reconciliation/", MigrationReconciliationView.as_view()),
    path("migration/audit-log/", MigrationAuditLogView.as_view()),
    path("migration/readiness/", MigrationReadinessView.as_view()),
]
