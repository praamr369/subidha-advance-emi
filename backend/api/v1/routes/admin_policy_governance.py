from django.urls import path

from api.v1.views.admin_policy_review_dates import AdminPolicyBulkReviewDateView
from api.v1.views.admin_policy_site import (
    AdminBusinessRulePolicyView,
    AdminPolicyCoverageView,
    AdminPolicyPageAcceptInternalView,
    AdminPolicyPageApproveView,
    AdminPolicyPageRejectView,
    AdminPolicyPageSubmitReviewView,
    AdminPolicyPageSyncGovernanceMetadataView,
    AdminWaiverClassificationMatrixView,
)

urlpatterns = [
    path("settings/legal-controls/", AdminBusinessRulePolicyView.as_view()),
    path("settings/waiver-classification/", AdminWaiverClassificationMatrixView.as_view()),
    path("settings/policies/coverage/", AdminPolicyCoverageView.as_view()),
    path("settings/policies/bulk-review-dates/", AdminPolicyBulkReviewDateView.as_view()),
    path("public-site/policies/<int:pk>/submit-review/", AdminPolicyPageSubmitReviewView.as_view()),
    path("public-site/policies/<int:pk>/approve/", AdminPolicyPageApproveView.as_view()),
    path("public-site/policies/<int:pk>/reject/", AdminPolicyPageRejectView.as_view()),
    path("public-site/policies/<int:pk>/accept-internal/", AdminPolicyPageAcceptInternalView.as_view()),
    path("public-site/policies/<int:pk>/sync-governance-metadata/", AdminPolicyPageSyncGovernanceMetadataView.as_view()),
]
