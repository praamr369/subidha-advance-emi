from django.contrib import admin

from reconciliation.models import ReconciliationEvidence, ReconciliationItem, ReconciliationRun


class ReconciliationItemInline(admin.TabularInline):
    model = ReconciliationItem
    extra = 0
    readonly_fields = ("source_type", "source_id", "status", "severity")
    fields = ("source_type", "source_id", "status", "severity", "exception_code")


@admin.register(ReconciliationRun)
class ReconciliationRunAdmin(admin.ModelAdmin):
    list_display = ("run_no", "module", "scope", "status", "started_at", "finished_at", "total_checked", "total_matched", "total_exceptions")
    list_filter = ("status", "module")
    search_fields = ("run_no", "module", "scope")
    ordering = ("-started_at",)
    readonly_fields = ("started_at", "finished_at", "total_checked", "total_matched", "total_exceptions", "high_risk_count")
    inlines = [ReconciliationItemInline]


@admin.register(ReconciliationItem)
class ReconciliationItemAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "source_type", "source_id", "status", "severity", "exception_code")
    list_filter = ("status", "severity", "module")
    search_fields = ("source_type", "source_id", "exception_code")
    readonly_fields = ("resolved_at", "created_at", "updated_at")


@admin.register(ReconciliationEvidence)
class ReconciliationEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "evidence_type", "label", "created_at")
    list_filter = ("evidence_type",)
    search_fields = ("evidence_type", "label")
    readonly_fields = ("created_at",)
