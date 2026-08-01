from django.urls import include, path
from api.v1.views.admin_business_setup import AdminBusinessLogoUploadView
from api.v1.views.admin_business_setup import AdminBusinessProfileView
from api.v1.views.admin_business_setup import AdminEmailSmtpSettingsView
from api.v1.views.admin_business_setup import AdminEmailSmtpTestView
from api.v1.views.admin_business_setup import AdminLocalSandboxResetView
from api.v1.views.admin_business_setup import AdminLocalSandboxSeedView
from api.v1.views.admin_business_setup import AdminServerDateView
from api.v1.views.admin_business_setup import AdminSetupSnapshotExportView
from api.v1.views.admin_business_setup import AdminSetupSnapshotImportView
from api.v1.views.admin_business_setup import BusinessSetupBackupJobDetailView
from api.v1.views.admin_business_setup import BusinessSetupBackupJobDownloadView
from api.v1.views.admin_business_setup import BusinessSetupBackupJobsView
from api.v1.views.admin_business_setup import BusinessSetupChecklistView
from api.v1.views.admin_business_setup import BusinessSetupDocumentNumberingView
from api.v1.views.admin_business_setup import BusinessSetupModularResetExecuteView
from api.v1.views.admin_business_setup import BusinessSetupModularResetPreviewView
from api.v1.views.admin_business_setup import BusinessSetupResetExecuteView
from api.v1.views.admin_business_setup import BusinessSetupResetPreviewView
from api.v1.views.admin_business_setup import BusinessSetupResetScopesView
from api.v1.views.admin_business_setup import BusinessSetupRestoreExecuteView
from api.v1.views.admin_business_setup import BusinessSetupRestoreJobDetailView
from api.v1.views.admin_business_setup import BusinessSetupRestoreJobsView
from api.v1.views.admin_business_setup import BusinessSetupRestorePreviewView
from api.v1.views.admin_dry_runs import AdminDryRunHistoryView
from api.v1.views.admin_dry_runs import AdminDryRunOptionsView
from api.v1.views.admin_dry_runs import AdminDryRunRunView
from api.v1.views.admin_otp_delivery import AdminOtpDeliveryReadinessView
from api.v1.views.admin_policy_site import AdminBusinessComplianceDocumentDetailView
from api.v1.views.admin_policy_site import AdminBusinessComplianceDocumentListCreateView
from api.v1.views.admin_policy_site import AdminBusinessComplianceSummaryView
from api.v1.views.admin_policy_site import AdminPolicyPageArchiveView
from api.v1.views.admin_policy_site import AdminPolicyPageBySlugView
from api.v1.views.admin_policy_site import AdminPolicyPageCreateDraftView
from api.v1.views.admin_policy_site import AdminPolicyPageDetailView
from api.v1.views.admin_policy_site import AdminPolicyPageListCreateView
from api.v1.views.admin_policy_site import AdminPolicyPagePublishView
from api.v1.views.admin_policy_site import AdminPolicySeedDefaultsView
from api.v1.views.admin_public_site import AdminPublicBusinessProfileView

urlpatterns = [

    path("business-profile/", AdminBusinessProfileView.as_view()),
    path("business-profile/logo/upload/", AdminBusinessLogoUploadView.as_view()),
    path("business-setup/checklist/", BusinessSetupChecklistView.as_view()),
    path("settings/email-smtp/", AdminEmailSmtpSettingsView.as_view()),
    path("settings/email-smtp/test/", AdminEmailSmtpTestView.as_view()),
    path("public-site/profile/", AdminPublicBusinessProfileView.as_view()),
    path("public-site/policies/", AdminPolicyPageListCreateView.as_view()),
    path("public-site/policies/seed-defaults/", AdminPolicySeedDefaultsView.as_view()),
    path("public-site/policies/by-slug/<slug:slug>/", AdminPolicyPageBySlugView.as_view()),
    path("public-site/policies/<int:pk>/", AdminPolicyPageDetailView.as_view()),
    path("public-site/policies/<int:pk>/publish/", AdminPolicyPagePublishView.as_view()),
    path("public-site/policies/<int:pk>/archive/", AdminPolicyPageArchiveView.as_view()),
    path("public-site/policies/<int:pk>/create-draft/", AdminPolicyPageCreateDraftView.as_view()),
    path(
        "public-site/business-compliance/documents/",
        AdminBusinessComplianceDocumentListCreateView.as_view(),
    ),
    path(
        "public-site/business-compliance/documents/<int:pk>/",
        AdminBusinessComplianceDocumentDetailView.as_view(),
    ),
    path(
        "public-site/business-compliance/summary/",
        AdminBusinessComplianceSummaryView.as_view(),
    ),
    path("business-setup/checklist/", BusinessSetupChecklistView.as_view()),
    path("business-setup/document-numbering/", BusinessSetupDocumentNumberingView.as_view()),
    path("business-setup/reset-preview/", BusinessSetupResetPreviewView.as_view()),
    path("business-setup/reset/", BusinessSetupResetExecuteView.as_view()),
    path("business-setup/reset-scopes/", BusinessSetupResetScopesView.as_view()),
    path("business-setup/reset-preview-v2/", BusinessSetupModularResetPreviewView.as_view()),
    path("business-setup/reset-v2/", BusinessSetupModularResetExecuteView.as_view()),
    path("business-setup/backups/", BusinessSetupBackupJobsView.as_view()),
    path("business-setup/backups/<int:pk>/", BusinessSetupBackupJobDetailView.as_view()),
    path("business-setup/backups/<int:pk>/download/", BusinessSetupBackupJobDownloadView.as_view()),
    path("business-setup/restore/preview/", BusinessSetupRestorePreviewView.as_view()),
    path("business-setup/restore/", BusinessSetupRestoreExecuteView.as_view()),
    path("business-setup/restore-jobs/", BusinessSetupRestoreJobsView.as_view()),
    path("business-setup/restore-jobs/<int:pk>/", BusinessSetupRestoreJobDetailView.as_view()),
    path("setup-snapshot/export/", AdminSetupSnapshotExportView.as_view()),
    path("setup-snapshot/import/", AdminSetupSnapshotImportView.as_view()),
    path("local-sandbox/seed/", AdminLocalSandboxSeedView.as_view()),
    path("local-sandbox/reset/", AdminLocalSandboxResetView.as_view()),
    path("server-date/", AdminServerDateView.as_view()),
    path("business-setup/dry-runs/options/", AdminDryRunOptionsView.as_view()),
    path("business-setup/dry-runs/run/", AdminDryRunRunView.as_view()),
    path("business-setup/dry-runs/history/", AdminDryRunHistoryView.as_view()),
    path("system/otp-delivery-readiness/", AdminOtpDeliveryReadinessView.as_view()),
]
