from django.urls import path

from api.v1.views.admin_business_compliance_evidence import AdminBusinessComplianceDocumentEvidenceView
from api.v1.views.admin_policy_site import (
    AdminBusinessComplianceDocumentApprovePublicSummaryView,
    AdminBusinessComplianceDocumentApproveView,
    AdminBusinessComplianceDocumentDetailView,
    AdminBusinessComplianceDocumentExpireView,
    AdminBusinessComplianceDocumentListCreateView,
    AdminBusinessComplianceDocumentRejectView,
    AdminBusinessComplianceDocumentRevokePublicSummaryView,
    AdminBusinessComplianceDocumentSubmitReviewView,
    AdminBusinessComplianceReadinessView,
    AdminBusinessComplianceSeedRowsView,
    AdminBusinessComplianceSummaryView,
    AdminBusinessComplianceTemplateListView,
)

urlpatterns = [
    path("settings/business-compliance/templates/", AdminBusinessComplianceTemplateListView.as_view()),
    path("settings/business-compliance/readiness/", AdminBusinessComplianceReadinessView.as_view()),
    path("settings/business-compliance/seed-rows/", AdminBusinessComplianceSeedRowsView.as_view()),
    path("settings/business-compliance/documents/", AdminBusinessComplianceDocumentListCreateView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/", AdminBusinessComplianceDocumentDetailView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/evidence/", AdminBusinessComplianceDocumentEvidenceView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/submit-review/", AdminBusinessComplianceDocumentSubmitReviewView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/approve/", AdminBusinessComplianceDocumentApproveView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/reject/", AdminBusinessComplianceDocumentRejectView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/expire/", AdminBusinessComplianceDocumentExpireView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/approve-public-summary/", AdminBusinessComplianceDocumentApprovePublicSummaryView.as_view()),
    path("settings/business-compliance/documents/<int:pk>/revoke-public-summary/", AdminBusinessComplianceDocumentRevokePublicSummaryView.as_view()),
    path("public-site/business-compliance/summary/", AdminBusinessComplianceSummaryView.as_view()),
]
