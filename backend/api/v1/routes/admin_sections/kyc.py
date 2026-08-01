from django.urls import include, path
from api.v1.views.admin_kyc import AdminCrmPartyKycView
from api.v1.views.admin_kyc import AdminCustomerKycAuditTrailView
from api.v1.views.admin_kyc import AdminCustomerKycRequestResubmissionView
from api.v1.views.admin_kyc import AdminCustomerKycUploadView
from api.v1.views.admin_kyc import AdminKycReviewQueueApproveView
from api.v1.views.admin_kyc import AdminKycReviewQueueRejectView
from api.v1.views.admin_kyc import AdminKycReviewQueueResubmitView
from api.v1.views.admin_kyc import AdminKycReviewQueueView
from api.v1.views.admin_kyc import AdminPartnerKycAuditTrailView
from api.v1.views.admin_kyc import AdminPartnerKycDocumentApproveView
from api.v1.views.admin_kyc import AdminPartnerKycDocumentDownloadView
from api.v1.views.admin_kyc import AdminPartnerKycDocumentListUploadView
from api.v1.views.admin_kyc import AdminPartnerKycDocumentRejectView
from api.v1.views.admin_kyc import AdminPartnerKycDocumentResubmitView
from api.v1.views.admin_kyc import AdminStaffKycAuditTrailView
from api.v1.views.admin_kyc import AdminStaffKycDocumentApproveView
from api.v1.views.admin_kyc import AdminStaffKycDocumentDownloadView
from api.v1.views.admin_kyc import AdminStaffKycDocumentListUploadView
from api.v1.views.admin_kyc import AdminStaffKycDocumentRejectView
from api.v1.views.admin_kyc import AdminStaffKycDocumentResubmitView
from api.v1.views.admin_kyc import AdminVendorKycAuditTrailView
from api.v1.views.admin_kyc import AdminVendorKycDocumentApproveView
from api.v1.views.admin_kyc import AdminVendorKycDocumentDownloadView
from api.v1.views.admin_kyc import AdminVendorKycDocumentListUploadView
from api.v1.views.admin_kyc import AdminVendorKycDocumentRejectView
from api.v1.views.admin_kyc import AdminVendorKycDocumentResubmitView

urlpatterns = [
    # KYC cross-owner review queue + CRM party KYC cockpit (Phase KYC – CRM-wide)
    path("kyc/review-queue/", AdminKycReviewQueueView.as_view()),
    path("kyc/review-queue/<str:owner_type>/<int:document_id>/approve/", AdminKycReviewQueueApproveView.as_view()),
    path("kyc/review-queue/<str:owner_type>/<int:document_id>/reject/", AdminKycReviewQueueRejectView.as_view()),
    path("kyc/review-queue/<str:owner_type>/<int:document_id>/request-resubmission/", AdminKycReviewQueueResubmitView.as_view()),
    path("crm/parties/<int:pk>/kyc/", AdminCrmPartyKycView.as_view()),
    # KYC intake & review – new additive endpoints (Phase KYC)
    # Customer
    path("customers/<int:pk>/kyc-documents/upload/", AdminCustomerKycUploadView.as_view()),
    path("customers/<int:pk>/kyc-documents/audit-trail/", AdminCustomerKycAuditTrailView.as_view()),
    path("customers/<int:pk>/kyc-documents/<int:doc_id>/request-resubmission/", AdminCustomerKycRequestResubmissionView.as_view()),
    # Partner
    path("partners/<int:pk>/kyc-documents/", AdminPartnerKycDocumentListUploadView.as_view()),
    path("partners/<int:pk>/kyc-documents/upload/", AdminPartnerKycDocumentListUploadView.as_view()),
    path("partners/<int:pk>/kyc-documents/audit-trail/", AdminPartnerKycAuditTrailView.as_view()),
    path("partners/<int:pk>/kyc-documents/<int:doc_id>/approve/", AdminPartnerKycDocumentApproveView.as_view()),
    path("partners/<int:pk>/kyc-documents/<int:doc_id>/reject/", AdminPartnerKycDocumentRejectView.as_view()),
    path("partners/<int:pk>/kyc-documents/<int:doc_id>/request-resubmission/", AdminPartnerKycDocumentResubmitView.as_view()),
    path("partners/<int:pk>/kyc-documents/<int:doc_id>/download/", AdminPartnerKycDocumentDownloadView.as_view()),
    # Vendor
    path("vendors/<int:pk>/kyc-documents/", AdminVendorKycDocumentListUploadView.as_view()),
    path("vendors/<int:pk>/kyc-documents/upload/", AdminVendorKycDocumentListUploadView.as_view()),
    path("vendors/<int:pk>/kyc-documents/audit-trail/", AdminVendorKycAuditTrailView.as_view()),
    path("vendors/<int:pk>/kyc-documents/<int:doc_id>/approve/", AdminVendorKycDocumentApproveView.as_view()),
    path("vendors/<int:pk>/kyc-documents/<int:doc_id>/reject/", AdminVendorKycDocumentRejectView.as_view()),
    path("vendors/<int:pk>/kyc-documents/<int:doc_id>/request-resubmission/", AdminVendorKycDocumentResubmitView.as_view()),
    path("vendors/<int:pk>/kyc-documents/<int:doc_id>/download/", AdminVendorKycDocumentDownloadView.as_view()),
    # Staff
    path("hr/staff/<int:staff_id>/kyc-documents/", AdminStaffKycDocumentListUploadView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/upload/", AdminStaffKycDocumentListUploadView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/audit-trail/", AdminStaffKycAuditTrailView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/<int:doc_id>/approve/", AdminStaffKycDocumentApproveView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/<int:doc_id>/reject/", AdminStaffKycDocumentRejectView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/<int:doc_id>/request-resubmission/", AdminStaffKycDocumentResubmitView.as_view()),
    path("hr/staff/<int:staff_id>/kyc-documents/<int:doc_id>/download/", AdminStaffKycDocumentDownloadView.as_view()),
]
