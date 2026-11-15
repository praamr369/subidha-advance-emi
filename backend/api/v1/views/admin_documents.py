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
        "is_subscription_doc": False,
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
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _serialize_subscription_doc(sub_doc):
    filename = sub_doc.file.name.split("/")[-1] if sub_doc.file else f"contract_{sub_doc.id}.pdf"
    file_size = 0
    try:
        if sub_doc.file and hasattr(sub_doc.file, "size"):
            file_size = sub_doc.file.size
    except Exception:
        file_size = 0
    sub_no = getattr(sub_doc.subscription, "subscription_number", None)
    customer_name = getattr(getattr(sub_doc.subscription, "customer", None), "name", None)
    doc_type_label = sub_doc.get_document_type_display() if hasattr(sub_doc, "get_document_type_display") else str(sub_doc.document_type)
    title = f"{doc_type_label} · {sub_no}" if sub_no else (filename or "Subscription Document")
    if customer_name:
        title += f" ({customer_name})"

    uploaded_name = None
    if sub_doc.uploaded_by:
        uploaded_name = sub_doc.uploaded_by.get_full_name() or sub_doc.uploaded_by.username
    elif getattr(sub_doc, "generated_by", None):
        uploaded_name = sub_doc.generated_by.get_full_name() or sub_doc.generated_by.username

    return {
        "id": sub_doc.id,
        "is_subscription_doc": True,
        "category": "contract",
        "category_label": "Contract",
        "title": title,
        "description": f"Subscription {sub_no or ''}",
        "original_filename": filename,
        "file_size": file_size,
        "mime_type": "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream",
        "file_url": sub_doc.file.url if sub_doc.file else None,
        "retention_date": None,
        "tags": f"contract,{sub_no or ''}",
        "uploaded_by": uploaded_name,
        "created_at": sub_doc.created_at.isoformat() if sub_doc.created_at else None,
    }


class AdminDocumentListView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        category = request.query_params.get("category")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        search = request.query_params.get("search")

        results = []
        qs = list_documents(category=category, date_from=date_from, date_to=date_to, search=search)
        results.extend([_serialize(d) for d in qs[:200]])

        # If category is "all" or "contract", also surface subscription documents
        if not category or category == "contract":
            try:
                from contracts.models import SubscriptionDocument
                sub_qs = SubscriptionDocument.objects.select_related(
                    "subscription", "subscription__customer", "uploaded_by", "generated_by"
                ).order_by("-created_at")
                if date_from:
                    sub_qs = sub_qs.filter(created_at__date__gte=date_from)
                if date_to:
                    sub_qs = sub_qs.filter(created_at__date__lte=date_to)
                if search:
                    sub_qs = sub_qs.filter(
                        subscription__subscription_number__icontains=search
                    )
                for sd in sub_qs[:100]:
                    results.append(_serialize_subscription_doc(sd))
            except Exception:
                pass

        return Response({
            "results": results,
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
        doc = DocumentRecord.objects.filter(pk=pk).first()
        if doc:
            return Response(_serialize(doc))

        try:
            from contracts.models import SubscriptionDocument
            sub_doc = SubscriptionDocument.objects.filter(pk=pk).first()
            if sub_doc:
                return Response(_serialize_subscription_doc(sub_doc))
        except Exception:
            pass

        raise Http404

    def delete(self, request, pk):
        doc = DocumentRecord.objects.filter(pk=pk).first()
        if doc:
            try:
                doc.file.delete(save=False)
            except Exception:
                pass
            doc.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        try:
            from contracts.models import SubscriptionDocument
            sub_doc = SubscriptionDocument.objects.filter(pk=pk).first()
            if sub_doc:
                return Response(
                    {"error": "Subscription contract documents cannot be deleted directly here."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception:
            pass

        return Response(status=status.HTTP_404_NOT_FOUND)


class AdminDocumentDownloadView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        doc = DocumentRecord.objects.filter(pk=pk).first()
        if doc and doc.file:
            try:
                content = doc.file.read()
                resp = HttpResponse(content, content_type=doc.mime_type or "application/octet-stream")
                resp["Content-Disposition"] = f'attachment; filename="{doc.original_filename or "document"}"'
                return resp
            except Exception:
                return Response({"error": "File not found on disk."}, status=status.HTTP_404_NOT_FOUND)

        # Fallback: check SubscriptionDocument
        try:
            from contracts.models import SubscriptionDocument
            sub_doc = SubscriptionDocument.objects.filter(pk=pk).first()
            if sub_doc and sub_doc.file:
                content = sub_doc.file.read()
                filename = sub_doc.file.name.split("/")[-1] or f"contract_{sub_doc.id}.pdf"
                content_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
                resp = HttpResponse(content, content_type=content_type)
                resp["Content-Disposition"] = f'attachment; filename="{filename}"'
                return resp
        except Exception:
            pass

        raise Http404


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
