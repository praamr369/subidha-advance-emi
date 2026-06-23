"""Admin KYC intake and review endpoints.

All views are IsAdmin-gated. Each view delegates to kyc_workflow_service.
File downloads stream directly from storage – never expose one owner's
files to another (all queries are scoped by owner pk).

Additive. Does not modify existing CustomerAdminViewSet KYC actions.
"""
from __future__ import annotations

import os

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from api.v1.permissions import IsAdmin
from subscriptions.services.kyc_workflow_service import (
    admin_upload_customer_kyc,
    admin_request_customer_kyc_resubmission,
    admin_upload_partner_kyc,
    admin_approve_partner_kyc_document,
    admin_reject_partner_kyc_document,
    admin_request_partner_kyc_resubmission,
    admin_upload_vendor_kyc,
    admin_approve_vendor_kyc_document,
    admin_reject_vendor_kyc_document,
    admin_request_vendor_kyc_resubmission,
    admin_upload_staff_kyc,
    admin_approve_staff_kyc_document,
    admin_reject_staff_kyc_document,
    admin_request_staff_kyc_resubmission,
    build_kyc_review_queue,
    get_kyc_audit_trail,
    get_party_kyc_readiness,
    queue_approve_kyc_document,
    queue_reject_kyc_document,
    queue_request_kyc_resubmission,
    KycDocumentNotFound,
)
from subscriptions.models_kyc_workflow import KycOwnerType


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _stream_file(document, filename_fallback: str):
    from django.http import FileResponse

    if not document.file:
        raise Http404("Document file missing.")
    filename = (
        (getattr(document, "original_filename", None) or "")
        or os.path.basename(document.file.name)
        or filename_fallback
    ).strip()
    return FileResponse(document.file.open("rb"), as_attachment=True, filename=filename)


# ---------------------------------------------------------------------------
# CUSTOMER KYC – new endpoints (complement existing CustomerAdminViewSet)
# ---------------------------------------------------------------------------

class AdminCustomerKycUploadView(APIView):
    """Admin uploads a KYC document for a customer.

    POST /admin/customers/{pk}/kyc-documents/upload/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        from subscriptions.models import Customer

        customer = get_object_or_404(Customer, pk=pk)
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})

        doc_type = (request.data.get("document_type") or "").strip()
        if not doc_type:
            raise ValidationError({"document_type": "document_type is required."})

        try:
            doc = admin_upload_customer_kyc(
                customer=customer,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                document_reference=(request.data.get("document_reference") or "").strip(),
                expiry_date=(request.data.get("expiry_date") or None),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})

        return Response(
            {
                "id": doc.pk,
                "status": doc.status,
                "document_type": doc.document_type,
                "expiry_date": doc.expiry_date.isoformat() if doc.expiry_date else None,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminCustomerKycRequestResubmissionView(APIView):
    """Admin requests resubmission for a specific customer KYC document.

    POST /admin/customers/{pk}/kyc-documents/{doc_id}/request-resubmission/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from subscriptions.models import Customer, CustomerKycDocument

        customer = get_object_or_404(Customer, pk=pk)
        document = get_object_or_404(CustomerKycDocument, pk=doc_id, customer=customer)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_request_customer_kyc_resubmission(
                customer=customer,
                document=document,
                reason=reason,
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminCustomerKycAuditTrailView(APIView):
    """Return full KYC audit trail for a customer.

    GET /admin/customers/{pk}/kyc-documents/audit-trail/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        from subscriptions.models import Customer

        customer = get_object_or_404(Customer, pk=pk)
        trail = get_kyc_audit_trail(KycOwnerType.CUSTOMER, customer.pk)
        return Response({"owner_type": KycOwnerType.CUSTOMER, "owner_id": customer.pk, "results": trail})


# ---------------------------------------------------------------------------
# PARTNER KYC – admin endpoints
# ---------------------------------------------------------------------------

class AdminPartnerKycDocumentListUploadView(APIView):
    """List and upload partner KYC documents.

    GET  /admin/partners/{pk}/kyc-documents/
    POST /admin/partners/{pk}/kyc-documents/upload/
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def _get_partner(self, pk):
        from accounts.models import User, UserRole
        from django.shortcuts import get_object_or_404

        return get_object_or_404(User, pk=pk, role=UserRole.PARTNER)

    def get(self, request, pk):
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        partner = self._get_partner(pk)
        docs = (
            PartnerKycDocument.objects.filter(partner_user=partner)
            .select_related("uploaded_by", "reviewed_by")
            .order_by("-created_at")
        )
        results = [
            {
                "id": d.pk,
                "document_type": d.document_type,
                "category": d.category,
                "status": d.status,
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "notes": d.notes,
                "upload_source": d.upload_source,
                "uploaded_by": getattr(d.uploaded_by, "username", None) if d.uploaded_by_id else None,
                "reviewed_by": getattr(d.reviewed_by, "username", None) if d.reviewed_by_id else None,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "rejection_reason": d.rejection_reason,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
        return Response({"count": len(results), "results": results})

    def post(self, request, pk):
        partner = self._get_partner(pk)
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        doc_type = (request.data.get("document_type") or "").strip()
        if not doc_type:
            raise ValidationError({"document_type": "document_type is required."})
        try:
            doc = admin_upload_partner_kyc(
                partner_user=partner,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                document_reference=(request.data.get("document_reference") or "").strip(),
                expiry_date=(request.data.get("expiry_date") or None),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(
            {"id": doc.pk, "status": doc.status, "document_type": doc.document_type},
            status=status.HTTP_201_CREATED,
        )


class AdminPartnerKycDocumentApproveView(APIView):
    """POST /admin/partners/{pk}/kyc-documents/{doc_id}/approve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounts.models import User, UserRole
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        partner = get_object_or_404(User, pk=pk, role=UserRole.PARTNER)
        document = get_object_or_404(PartnerKycDocument, pk=doc_id, partner_user=partner)
        doc = admin_approve_partner_kyc_document(partner_user=partner, document=document, performed_by=request.user)
        return Response({"id": doc.pk, "status": doc.status})


class AdminPartnerKycDocumentRejectView(APIView):
    """POST /admin/partners/{pk}/kyc-documents/{doc_id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounts.models import User, UserRole
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        partner = get_object_or_404(User, pk=pk, role=UserRole.PARTNER)
        document = get_object_or_404(PartnerKycDocument, pk=doc_id, partner_user=partner)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_reject_partner_kyc_document(
                partner_user=partner, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminPartnerKycDocumentResubmitView(APIView):
    """POST /admin/partners/{pk}/kyc-documents/{doc_id}/request-resubmission/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounts.models import User, UserRole
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        partner = get_object_or_404(User, pk=pk, role=UserRole.PARTNER)
        document = get_object_or_404(PartnerKycDocument, pk=doc_id, partner_user=partner)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_request_partner_kyc_resubmission(
                partner_user=partner, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminPartnerKycDocumentDownloadView(APIView):
    """GET /admin/partners/{pk}/kyc-documents/{doc_id}/download/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk, doc_id):
        from accounts.models import User, UserRole
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        partner = get_object_or_404(User, pk=pk, role=UserRole.PARTNER)
        document = get_object_or_404(PartnerKycDocument, pk=doc_id, partner_user=partner)
        return _stream_file(document, f"partner-kyc-{doc_id}")


class AdminPartnerKycAuditTrailView(APIView):
    """GET /admin/partners/{pk}/kyc-documents/audit-trail/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        from accounts.models import User, UserRole

        partner = get_object_or_404(User, pk=pk, role=UserRole.PARTNER)
        trail = get_kyc_audit_trail(KycOwnerType.PARTNER, partner.pk)
        return Response({"owner_type": KycOwnerType.PARTNER, "owner_id": partner.pk, "results": trail})


# ---------------------------------------------------------------------------
# VENDOR KYC – admin endpoints
# ---------------------------------------------------------------------------

class AdminVendorKycDocumentListUploadView(APIView):
    """GET + POST /admin/vendors/{pk}/kyc-documents/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def _get_vendor(self, pk):
        from accounting.models import Vendor

        return get_object_or_404(Vendor, pk=pk)

    def get(self, request, pk):
        from accounting.models import VendorKycDocument

        vendor = self._get_vendor(pk)
        docs = (
            VendorKycDocument.objects.filter(vendor=vendor)
            .select_related("uploaded_by", "reviewed_by")
            .order_by("-created_at")
        )
        results = [
            {
                "id": d.pk,
                "document_type": d.document_type,
                "category": d.category,
                "status": d.status,
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "notes": d.notes,
                "upload_source": d.upload_source,
                "uploaded_by": getattr(d.uploaded_by, "username", None) if d.uploaded_by_id else None,
                "reviewed_by": getattr(d.reviewed_by, "username", None) if d.reviewed_by_id else None,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "rejection_reason": d.rejection_reason,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
        return Response({"count": len(results), "results": results})

    def post(self, request, pk):
        vendor = self._get_vendor(pk)
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        doc_type = (request.data.get("document_type") or "").strip()
        if not doc_type:
            raise ValidationError({"document_type": "document_type is required."})
        try:
            doc = admin_upload_vendor_kyc(
                vendor=vendor,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                document_reference=(request.data.get("document_reference") or "").strip(),
                expiry_date=(request.data.get("expiry_date") or None),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(
            {"id": doc.pk, "status": doc.status, "document_type": doc.document_type},
            status=status.HTTP_201_CREATED,
        )


class AdminVendorKycDocumentApproveView(APIView):
    """POST /admin/vendors/{pk}/kyc-documents/{doc_id}/approve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounting.models import Vendor, VendorKycDocument

        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorKycDocument, pk=doc_id, vendor=vendor)
        doc = admin_approve_vendor_kyc_document(vendor=vendor, document=document, performed_by=request.user)
        return Response({"id": doc.pk, "status": doc.status})


class AdminVendorKycDocumentRejectView(APIView):
    """POST /admin/vendors/{pk}/kyc-documents/{doc_id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounting.models import Vendor, VendorKycDocument

        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorKycDocument, pk=doc_id, vendor=vendor)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_reject_vendor_kyc_document(
                vendor=vendor, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminVendorKycDocumentResubmitView(APIView):
    """POST /admin/vendors/{pk}/kyc-documents/{doc_id}/request-resubmission/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk, doc_id):
        from accounting.models import Vendor, VendorKycDocument

        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorKycDocument, pk=doc_id, vendor=vendor)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_request_vendor_kyc_resubmission(
                vendor=vendor, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminVendorKycDocumentDownloadView(APIView):
    """GET /admin/vendors/{pk}/kyc-documents/{doc_id}/download/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk, doc_id):
        from accounting.models import Vendor, VendorKycDocument

        vendor = get_object_or_404(Vendor, pk=pk)
        document = get_object_or_404(VendorKycDocument, pk=doc_id, vendor=vendor)
        return _stream_file(document, f"vendor-kyc-{doc_id}")


class AdminVendorKycAuditTrailView(APIView):
    """GET /admin/vendors/{pk}/kyc-documents/audit-trail/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        from accounting.models import Vendor

        vendor = get_object_or_404(Vendor, pk=pk)
        trail = get_kyc_audit_trail(KycOwnerType.VENDOR, vendor.pk)
        return Response({"owner_type": KycOwnerType.VENDOR, "owner_id": vendor.pk, "results": trail})


# ---------------------------------------------------------------------------
# STAFF KYC – admin endpoints
# ---------------------------------------------------------------------------

class AdminStaffKycDocumentListUploadView(APIView):
    """GET + POST /admin/hr/staff/{staff_id}/kyc-documents/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def _get_employee(self, staff_id):
        from accounting.models import EmployeeProfile

        return get_object_or_404(EmployeeProfile, pk=staff_id)

    def get(self, request, staff_id):
        from accounting.models import StaffKycDocument

        employee = self._get_employee(staff_id)
        docs = (
            StaffKycDocument.objects.filter(employee=employee)
            .select_related("uploaded_by", "reviewed_by")
            .order_by("-created_at")
        )
        results = [
            {
                "id": d.pk,
                "document_type": d.document_type,
                "category": d.category,
                "status": d.status,
                "original_filename": d.original_filename,
                "file_size": d.file_size,
                "notes": d.notes,
                "upload_source": d.upload_source,
                "uploaded_by": getattr(d.uploaded_by, "username", None) if d.uploaded_by_id else None,
                "reviewed_by": getattr(d.reviewed_by, "username", None) if d.reviewed_by_id else None,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "rejection_reason": d.rejection_reason,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
        return Response({"count": len(results), "results": results})

    def post(self, request, staff_id):
        employee = self._get_employee(staff_id)
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        doc_type = (request.data.get("document_type") or "").strip()
        if not doc_type:
            raise ValidationError({"document_type": "document_type is required."})
        try:
            doc = admin_upload_staff_kyc(
                employee=employee,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                document_reference=(request.data.get("document_reference") or "").strip(),
                expiry_date=(request.data.get("expiry_date") or None),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(
            {"id": doc.pk, "status": doc.status, "document_type": doc.document_type},
            status=status.HTTP_201_CREATED,
        )


class AdminStaffKycDocumentApproveView(APIView):
    """POST /admin/hr/staff/{staff_id}/kyc-documents/{doc_id}/approve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, staff_id, doc_id):
        from accounting.models import EmployeeProfile, StaffKycDocument

        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        document = get_object_or_404(StaffKycDocument, pk=doc_id, employee=employee)
        doc = admin_approve_staff_kyc_document(employee=employee, document=document, performed_by=request.user)
        return Response({"id": doc.pk, "status": doc.status})


class AdminStaffKycDocumentRejectView(APIView):
    """POST /admin/hr/staff/{staff_id}/kyc-documents/{doc_id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, staff_id, doc_id):
        from accounting.models import EmployeeProfile, StaffKycDocument

        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        document = get_object_or_404(StaffKycDocument, pk=doc_id, employee=employee)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_reject_staff_kyc_document(
                employee=employee, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminStaffKycDocumentResubmitView(APIView):
    """POST /admin/hr/staff/{staff_id}/kyc-documents/{doc_id}/request-resubmission/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, staff_id, doc_id):
        from accounting.models import EmployeeProfile, StaffKycDocument

        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        document = get_object_or_404(StaffKycDocument, pk=doc_id, employee=employee)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = admin_request_staff_kyc_resubmission(
                employee=employee, document=document, reason=reason, performed_by=request.user
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"id": doc.pk, "status": doc.status})


class AdminStaffKycDocumentDownloadView(APIView):
    """GET /admin/hr/staff/{staff_id}/kyc-documents/{doc_id}/download/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, staff_id, doc_id):
        from accounting.models import EmployeeProfile, StaffKycDocument

        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        document = get_object_or_404(StaffKycDocument, pk=doc_id, employee=employee)
        return _stream_file(document, f"staff-kyc-{doc_id}")


class AdminStaffKycAuditTrailView(APIView):
    """GET /admin/hr/staff/{staff_id}/kyc-documents/audit-trail/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, staff_id):
        from accounting.models import EmployeeProfile

        employee = get_object_or_404(EmployeeProfile, pk=staff_id)
        trail = get_kyc_audit_trail(KycOwnerType.STAFF, employee.pk)
        return Response({"owner_type": KycOwnerType.STAFF, "owner_id": employee.pk, "results": trail})


# ---------------------------------------------------------------------------
# CROSS-OWNER KYC REVIEW QUEUE (CRM-wide cockpit)
# ---------------------------------------------------------------------------

_QUEUE_OWNER_TYPES = {
    KycOwnerType.CUSTOMER,
    KycOwnerType.PARTNER,
    KycOwnerType.VENDOR,
    KycOwnerType.STAFF,
}


def _normalize_owner_type(raw: str) -> str:
    ot = (raw or "").strip().upper()
    if ot not in _QUEUE_OWNER_TYPES:
        raise ValidationError({"owner_type": f"Unknown owner type: {raw}"})
    return ot


class AdminKycReviewQueueView(APIView):
    """Cross-owner KYC review queue.

    GET /admin/kyc/review-queue/

    Aggregates pending/submitted/rejected/resubmission-required KYC documents
    across customers, partners, vendors and staff from the canonical stores.
    Read-only; admin-only.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        params = request.query_params
        expires_within_days = None
        raw_exp = params.get("expires_within_days", "")
        if raw_exp:
            try:
                expires_within_days = max(0, int(raw_exp))
            except (TypeError, ValueError):
                pass
        data = build_kyc_review_queue(
            owner_type=params.get("owner_type", ""),
            status=params.get("status", ""),
            document_type=params.get("document_type", ""),
            category=params.get("category", ""),
            search=params.get("search", "") or params.get("q", ""),
            upload_source=params.get("upload_source", ""),
            date_from=params.get("date_from", ""),
            date_to=params.get("date_to", ""),
            expires_within_days=expires_within_days,
            limit=params.get("limit", 500),
        )
        return Response(data)


class AdminKycReviewQueueApproveView(APIView):
    """POST /admin/kyc/review-queue/{owner_type}/{document_id}/approve/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, owner_type, document_id):
        ot = _normalize_owner_type(owner_type)
        try:
            doc = queue_approve_kyc_document(
                owner_type=ot, document_id=document_id, performed_by=request.user
            )
        except KycDocumentNotFound as exc:
            raise Http404(str(exc))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"owner_type": ot, "document_id": doc.pk, "status": doc.status})


class AdminKycReviewQueueRejectView(APIView):
    """POST /admin/kyc/review-queue/{owner_type}/{document_id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, owner_type, document_id):
        ot = _normalize_owner_type(owner_type)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = queue_reject_kyc_document(
                owner_type=ot, document_id=document_id, reason=reason, performed_by=request.user
            )
        except KycDocumentNotFound as exc:
            raise Http404(str(exc))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"owner_type": ot, "document_id": doc.pk, "status": doc.status})


class AdminKycReviewQueueResubmitView(APIView):
    """POST /admin/kyc/review-queue/{owner_type}/{document_id}/request-resubmission/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, owner_type, document_id):
        ot = _normalize_owner_type(owner_type)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required."})
        try:
            doc = queue_request_kyc_resubmission(
                owner_type=ot, document_id=document_id, reason=reason, performed_by=request.user
            )
        except KycDocumentNotFound as exc:
            raise Http404(str(exc))
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({"owner_type": ot, "document_id": doc.pk, "status": doc.status})


# ---------------------------------------------------------------------------
# CRM PARTY KYC COCKPIT
# ---------------------------------------------------------------------------

class AdminCrmPartyKycView(APIView):
    """Party-level KYC cockpit.

    GET /admin/crm/parties/{id}/kyc/

    Resolves a CRM PartyMaster to its linked canonical owner and returns that
    owner's existing KYC documents/readiness. Unconverted leads return a
    controlled ``kyc_available: False`` response. No separate party KYC store.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        from crm.models import PartyMaster

        party = get_object_or_404(PartyMaster.objects.prefetch_related("links"), pk=pk)
        return Response(get_party_kyc_readiness(party))
