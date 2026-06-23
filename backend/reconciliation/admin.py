from django.contrib import admin

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationRun,
)


class ReconciliationItemInline(admin.TabularInline):
    model = ReconciliationItem
    extra = 0
    fields = ("source_type", "source_id", "status", "amount", "matched_at")
    readonly_fields = ("source_type", "source_id", "amount", "matched_at")
    show_change_link = True


@admin.register(ReconciliationRun)
class ReconciliationRunAdmin(admin.ModelAdmin):
    list_display = ("id", "run_type", "status", "started_at", "completed_at", "total_items", "matched_items", "unmatched_items")
    list_filter = ("run_type", "status")
    search_fields = ("id", "run_type")
    readonly_fields = ("started_at", "completed_at", "total_items", "matched_items", "unmatched_items")
    inlines = [ReconciliationItemInline]


@admin.register(ReconciliationItem)
class ReconciliationItemAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "source_type", "source_id", "status", "amount", "matched_at")
    list_filter = ("source_type", "status")
    search_fields = ("source_type", "source_id", "run__id")
    readonly_fields = ("matched_at",)


@admin.register(ReconciliationEvidence)
class ReconciliationEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "evidence_type", "uploaded_at")
    list_filter = ("evidence_type",)
    search_fields = ("item__source_id", "evidence_type")
    readonly_fields = ("uploaded_at",)
