"""Staff self-service KYC endpoints.

Staff portal users (role=STAFF, linked to an accounting.EmployeeProfile via
accounts.StaffIdentity) can upload and view their own KYC documents but
CANNOT approve them. Only admins review/approve.

Privacy: all queries are scoped to the employee linked to request.user.
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

from accounts.models import StaffIdentity
from api.v1.permissions import IsStaff
from subscriptions.models_kyc_workflow import KycOwnerType
from subscriptions.services.kyc_workflow_service import (
    get_kyc_audit_trail,
    staff_self_upload_kyc,
)


def _resolve_employee_or_404(request):
    identity = (
        StaffIdentity.objects.select_related("employee")
        .filter(user=request.user)
        .first()
    )
    if identity is None or identity.employee_id is None:
        raise Http404("No staff profile linked to this account.")
    return identity.employee


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


class StaffSelfKycDocumentListUploadView(APIView):
    """List + upload the staff member's own KYC documents.

    GET  /staff/kyc/documents/
    POST /staff/kyc/documents/upload/
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        from accounting.models import StaffKycDocument

        employee = _resolve_employee_or_404(request)
        docs = (
            StaffKycDocument.objects.filter(employee=employee)
            .select_related("reviewed_by")
            .order_by("-created_at")
        )
        results = [_serialize_doc(d) for d in docs]
        return Response({"count": len(results), "results": results})

    def post(self, request):
        employee = _resolve_employee_or_404(request)
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
            doc = staff_self_upload_kyc(
                employee=employee,
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


class StaffSelfKycDocumentDownloadView(APIView):
    """GET /staff/kyc/documents/{doc_id}/download/ – own documents only."""
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request, doc_id):
        from accounting.models import StaffKycDocument

        employee = _resolve_employee_or_404(request)
        document = get_object_or_404(StaffKycDocument, pk=doc_id, employee=employee)
        if not document.file:
            raise Http404("Document file missing.")
        filename = (
            (document.original_filename or "")
            or os.path.basename(document.file.name)
            or f"kyc-{doc_id}"
        ).strip()
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=filename)


class StaffSelfKycAuditTrailView(APIView):
    """GET /staff/kyc/audit-trail/ – own KYC audit trail."""
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        employee = _resolve_employee_or_404(request)
        trail = get_kyc_audit_trail(KycOwnerType.STAFF, employee.pk)
        return Response(
            {"owner_type": KycOwnerType.STAFF, "owner_id": employee.pk, "results": trail}
        )
