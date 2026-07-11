import json
from datetime import date

from django.http import HttpResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import status

from api.v1.permissions import IsAdmin
from documents.models import DocumentRecord, CATEGORY_CHOICES
from documents.services.document_service import upload_document, list_documents, bulk_zip_export
from documents.services.pdf_service import (
    generate_invoice_pdf,
    generate_receipt_pdf,
    generate_contract_pdf,
    generate_kyc_pdf,
)


def _serialize(doc):
    return {
        "id": doc.id,
        "category": doc.category,
        "category_label": doc.get_category_display(),
        "title": doc.title,
        "description": doc.description,
        "original_filename": doc.original_filename,
        "file_size": doc.file_size,
        "mime_type": doc.mime_type,
        "file_url": doc.file.url if doc.file else None,
        "retention_date": doc.retention_date.isoformat() if doc.retention_date else None,
        "tags": doc.tags,
        "uploaded_by": doc.uploaded_by.get_full_name() if doc.uploaded_by else None,
        "created_at": doc.created_at.isoformat(),
    }


class AdminDocumentListView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        category = request.query_params.get("category")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        search = request.query_params.get("search")

        qs = list_documents(category=category, date_from=date_from, date_to=date_to, search=search)
        return Response({
            "results": [_serialize(d) for d in qs[:200]],
            "categories": [{"value": v, "label": l} for v, l in CATEGORY_CHOICES],
        })

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        category = request.data.get("category", "other")
        title = request.data.get("title") or file_obj.name
        description = request.data.get("description", "")
        retention_date = request.data.get("retention_date") or None
        tags = request.data.get("tags", "")

        doc = upload_document(
            file_obj=file_obj,
            category=category,
            title=title,
            description=description,
            retention_date=retention_date,
            tags=tags,
            uploaded_by=request.user,
        )
        return Response(_serialize(doc), status=status.HTTP_201_CREATED)


class AdminDocumentDetailView(APIView):
    permission_classes = [IsAdmin]

    def get_object(self, pk):
        try:
            return DocumentRecord.objects.get(pk=pk)
        except DocumentRecord.DoesNotExist:
            raise Http404

    def get(self, request, pk):
        doc = self.get_object(pk)
        return Response(_serialize(doc))

    def delete(self, request, pk):
        doc = self.get_object(pk)
        try:
            doc.file.delete(save=False)
        except Exception:
            pass
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminDocumentDownloadView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        try:
            doc = DocumentRecord.objects.get(pk=pk)
        except DocumentRecord.DoesNotExist:
            raise Http404
        try:
            content = doc.file.read()
        except Exception:
            return Response({"error": "File not found on disk."}, status=status.HTTP_404_NOT_FOUND)
        resp = HttpResponse(content, content_type=doc.mime_type or "application/octet-stream")
        resp["Content-Disposition"] = f'attachment; filename="{doc.original_filename or "document"}"'
        return resp


class AdminDocumentZipExportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        category = request.query_params.get("category")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        return bulk_zip_export(category=category, date_from=date_from, date_to=date_to)


class AdminDocumentGeneratePdfView(APIView):
    """Generate a PDF on-the-fly from structured data and optionally save it."""
    permission_classes = [IsAdmin]

    PDF_GENERATORS = {
        "invoice": generate_invoice_pdf,
        "receipt": generate_receipt_pdf,
        "contract": generate_contract_pdf,
        "kyc": generate_kyc_pdf,
    }

    def post(self, request):
        doc_type = request.data.get("type")
        data = request.data.get("data", {})
        save = request.data.get("save", False)

        generator = self.PDF_GENERATORS.get(doc_type)
        if not generator:
            return Response(
                {"error": f"Unsupported type. Choose from: {list(self.PDF_GENERATORS.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes = generator(data)

        if save:
            from django.core.files.base import ContentFile
            ref = data.get("ref_no", "generated")
            title = f"{doc_type.title()} {ref}"
            doc = DocumentRecord(
                category=doc_type if doc_type in dict(CATEGORY_CHOICES) else "other",
                title=title,
                original_filename=f"{title.replace(' ', '_')}.pdf",
                file_size=len(pdf_bytes),
                mime_type="application/pdf",
                uploaded_by=request.user,
            )
            doc.file.save(f"{title.replace(' ', '_')}.pdf", ContentFile(pdf_bytes), save=True)
            return Response({"saved": True, "document": _serialize(doc)}, status=status.HTTP_201_CREATED)

        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        ref = data.get("ref_no", "document")
        resp["Content-Disposition"] = f'inline; filename="{doc_type}_{ref}.pdf"'
        return resp
