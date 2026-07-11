import os
import uuid
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType


CATEGORY_CHOICES = [
    ("invoice", "Invoice"),
    ("purchase_invoice", "Purchase Invoice"),
    ("receipt", "Receipt"),
    ("contract", "Contract"),
    ("kyc", "KYC Document"),
    ("po", "Purchase Order"),
    ("journal", "Journal Entry"),
    ("legal", "Legal Document"),
    ("other", "Other"),
]


def document_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1]
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in os.path.splitext(filename)[0])[:40]
    uid = str(uuid.uuid4())[:8]
    from django.utils import timezone
    now = timezone.now()
    return f"documents/{instance.category}/{now.year}/{now.month:02d}/{safe_name}_{uid}{ext}"


class DocumentRecord(models.Model):
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=document_upload_path)
    original_filename = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)

    # Generic FK — link to any model (customer, subscription, vendor, etc.)
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, null=True, blank=True)
    object_id = models.PositiveBigIntegerField(null=True, blank=True)
    linked_object = GenericForeignKey("content_type", "object_id")

    retention_date = models.DateField(null=True, blank=True)
    tags = models.CharField(max_length=500, blank=True)

    uploaded_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="uploaded_documents"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category", "created_at"]),
        ]

    def __str__(self):
        return f"{self.get_category_display()} — {self.title}"
