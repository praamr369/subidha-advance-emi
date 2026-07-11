import io
import zipfile
from datetime import date

from django.core.files.base import ContentFile
from django.http import StreamingHttpResponse

from documents.models import DocumentRecord


def upload_document(file_obj, category, title, description="", retention_date=None, tags="", uploaded_by=None):
    doc = DocumentRecord(
        category=category,
        title=title,
        description=description,
        original_filename=file_obj.name,
        file_size=file_obj.size,
        mime_type=getattr(file_obj, "content_type", ""),
        retention_date=retention_date,
        tags=tags,
        uploaded_by=uploaded_by,
    )
    doc.file.save(file_obj.name, ContentFile(file_obj.read()), save=True)
    return doc


def list_documents(category=None, date_from=None, date_to=None, search=None):
    qs = DocumentRecord.objects.select_related("uploaded_by")
    if category:
        qs = qs.filter(category=category)
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    if search:
        qs = qs.filter(title__icontains=search)
    return qs


def bulk_zip_export(category=None, date_from=None, date_to=None):
    qs = list_documents(category=category, date_from=date_from, date_to=date_to)

    def generate():
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in qs:
                try:
                    with doc.file.open("rb") as f:
                        arcname = f"{doc.category}/{doc.id}_{doc.original_filename or 'file'}"
                        zf.writestr(arcname, f.read())
                except Exception:
                    pass
        buf.seek(0)
        yield buf.read()

    filename_parts = []
    if category:
        filename_parts.append(category)
    if date_from:
        filename_parts.append(str(date_from))
    if date_to:
        filename_parts.append(str(date_to))
    filename = "documents_" + ("_".join(filename_parts) if filename_parts else "all") + ".zip"

    response = StreamingHttpResponse(generate(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
