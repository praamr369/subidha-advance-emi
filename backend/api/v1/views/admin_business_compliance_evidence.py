from __future__ import annotations

import mimetypes
from pathlib import Path

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models_business_setup import BusinessComplianceDocument
from subscriptions.services.business_compliance_review_actions import has_real_evidence


class AdminBusinessComplianceDocumentEvidenceView(APIView):
    """
    Admin-only evidence reader for private business compliance files.

    The public compliance summary API must never expose raw compliance files.
    This endpoint exists only for authenticated admins reviewing uploaded proof
    before submit/approve/reject/expire actions.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        document = get_object_or_404(BusinessComplianceDocument, pk=pk)
        if not has_real_evidence(document):
            raise Http404("No evidence file is attached to this compliance document.")

        file_name = Path(document.file.name or f"business-compliance-{document.pk}").name
        content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        response = FileResponse(
            document.file.open("rb"),
            as_attachment=False,
            filename=file_name,
            content_type=content_type,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
