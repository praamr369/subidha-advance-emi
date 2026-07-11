from django.contrib import admin
from .models import DocumentRecord


@admin.register(DocumentRecord)
class DocumentRecordAdmin(admin.ModelAdmin):
    list_display = ["title", "category", "original_filename", "file_size", "created_at"]
    list_filter = ["category"]
    search_fields = ["title", "original_filename", "tags"]
    readonly_fields = ["created_at", "updated_at", "file_size", "mime_type", "original_filename"]
