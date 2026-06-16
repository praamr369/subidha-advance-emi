"""Partner self-service KYC endpoints.

Partners can upload their own KYC documents and view status, but CANNOT
approve their own KYC. Only admins can review/approve.

Privacy: all queries are scoped to request.user, so no cross-user leakage.
"""
from __future__ import annotations

import os

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from subscriptions.models_kyc_workflow import KycOwnerType
from subscriptions.services.kyc_workflow_service import (
    get_kyc_audit_trail,
    partner_self_upload_kyc,
)


class PartnerSelfKycDocumentListUploadView(APIView):
    """List + upload partner's own KYC documents.

    GET  /partner/kyc/documents/
    POST /partner/kyc/documents/upload/
    """
    permission_classes = [permissions.IsAuthenticated, IsPartner]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        docs = (
            PartnerKycDocument.objects.filter(partner_user=request.user)
            .select_related("reviewed_by")
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
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "rejection_reason": d.rejection_reason
                if d.status in ("REJECTED", "RESUBMISSION_REQUIRED")
                else "",
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]
        return Response({"count": len(results), "results": results})

    def post(self, request):
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
            doc = partner_self_upload_kyc(
                partner_user=request.user,
                file=file,
                document_type=doc_type,
                category=(request.data.get("category") or "").strip(),
                notes=(request.data.get("notes") or "").strip(),
                resubmission_of_id=resubmission_of_id,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(
            {"id": doc.pk, "status": doc.status, "document_type": doc.document_type},
            status=status.HTTP_201_CREATED,
        )


class PartnerSelfKycDocumentDownloadView(APIView):
    """GET /partner/kyc/documents/{doc_id}/download/

    Partner can download their own documents only.
    """
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request, doc_id):
        from subscriptions.models_kyc_workflow import PartnerKycDocument

        document = get_object_or_404(
            PartnerKycDocument, pk=doc_id, partner_user=request.user
        )
        if not document.file:
            raise Http404("Document file missing.")
        filename = (
            (document.original_filename or "")
            or os.path.basename(document.file.name)
            or f"kyc-{doc_id}"
        ).strip()
        from django.http import FileResponse

        return FileResponse(document.file.open("rb"), as_attachment=True, filename=filename)


class PartnerSelfKycAuditTrailView(APIView):
    """GET /partner/kyc/audit-trail/

    Partner can view their own KYC audit trail.
    """
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        trail = get_kyc_audit_trail(KycOwnerType.PARTNER, request.user.pk)
        return Response(
            {
                "owner_type": KycOwnerType.PARTNER,
                "owner_id": request.user.pk,
                "results": trail,
            }
        )
