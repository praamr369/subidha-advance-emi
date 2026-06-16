"""Vendor self-service KYC endpoints.

Vendor portal users (role=VENDOR, linked to an accounting.Vendor via
``linked_user``) can upload and view their own KYC documents but CANNOT
approve them. Only admins review/approve.

Privacy: all queries are scoped to the vendor linked to request.user.
"""
from __future__ import annotations

import os

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsVendor
from subscriptions.models_kyc_workflow import KycOwnerType
from subscriptions.services.kyc_workflow_service import (
    get_kyc_audit_trail,
    vendor_self_upload_kyc,
)


def _resolve_vendor_or_404(request):
    from accounting.models import Vendor

    vendor = Vendor.objects.filter(linked_user=request.user).first()
    if vendor is None:
        raise Http404("No vendor profile linked to this account.")
    return vendor


def _serialize_doc(d):
    return {
        "id": d.pk,
        "document_type": d.document_type,
        "category": d.category,
        "status": d.status,
        "original_filename": d.original_filename,
        "file_size": d.file_size,
        "notes": d.notes,
        "upload_source": d.upload_source,
        "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
        "rejection_reason": d.rejection_reason
        if d.status in ("REJECTED", "RESUBMISSION_REQUIRED")
        else "",
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


class VendorSelfKycDocumentListUploadView(APIView):
    """List + upload the vendor's own KYC documents.

    GET  /vendor/kyc/documents/
    POST /vendor/kyc/documents/upload/
    """
    permission_classes = [permissions.IsAuthenticated, IsVendor]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        from accounting.models import VendorKycDocument

        vendor = _resolve_vendor_or_404(request)
        docs = (
            VendorKycDocument.objects.filter(vendor=vendor)
            .select_related("reviewed_by")
            .order_by("-created_at")
        )
        results = [_serialize_doc(d) for d in docs]
        return Response({"count": len(results), "results": results})

    def post(self, request):
        vendor = _resolve_vendor_or_404(request)
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file provided."})
        doc_type = (request.data.get("document_type") or "").strip()
        if not doc_type:
            raise ValidationError({"document_type": "document_type is required."})

        resubmission_of_id = None
        raw_resub = (request.data.get("resubmission_of") or "").strip()
        if raw_resub and raw_resub.isdigit():
            resubmission_of_id = int(raw_resub)

        try:
            doc = vendor_self_upload_kyc(
                vendor=vendor,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                performed_by=request.user,
                resubmission_of_id=resubmission_of_id,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(
            {"id": doc.pk, "status": doc.status, "document_type": doc.document_type},
            status=status.HTTP_201_CREATED,
        )


class VendorSelfKycDocumentDownloadView(APIView):
    """GET /vendor/kyc/documents/{doc_id}/download/ – own documents only."""
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request, doc_id):
        from accounting.models import VendorKycDocument

        vendor = _resolve_vendor_or_404(request)
        document = get_object_or_404(VendorKycDocument, pk=doc_id, vendor=vendor)
        if not document.file:
            raise Http404("Document file missing.")
        filename = (
            (document.original_filename or "")
            or os.path.basename(document.file.name)
            or f"kyc-{doc_id}"
        ).strip()
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=filename)


class VendorSelfKycAuditTrailView(APIView):
    """GET /vendor/kyc/audit-trail/ – own KYC audit trail."""
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = _resolve_vendor_or_404(request)
        trail = get_kyc_audit_trail(KycOwnerType.VENDOR, vendor.pk)
        return Response(
            {"owner_type": KycOwnerType.VENDOR, "owner_id": vendor.pk, "results": trail}
        )
