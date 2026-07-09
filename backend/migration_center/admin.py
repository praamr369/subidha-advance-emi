from django.contrib import admin

from migration_center.models import (
    MigrationAuditLog, MigrationBatch, MigrationMappingRule, MigrationStagingRow,
)


@admin.register(MigrationBatch)
class MigrationBatchAdmin(admin.ModelAdmin):
    list_display = ("batch_number", "dataset_key", "source_type", "status", "total_rows", "imported_rows", "failed_rows", "created_at")
    list_filter = ("status", "dataset_key", "source_type")
    search_fields = ("batch_number", "original_filename")
    readonly_fields = tuple(f.name for f in MigrationBatch._meta.fields)


@admin.register(MigrationStagingRow)
class MigrationStagingRowAdmin(admin.ModelAdmin):
    list_display = ("batch", "row_number", "status", "duplicate_resolution", "target_model", "target_pk")
    list_filter = ("status",)
    search_fields = ("batch__batch_number",)


@admin.register(MigrationMappingRule)
class MigrationMappingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "dataset_key", "source_type", "is_default")
    list_filter = ("dataset_key", "source_type")


@admin.register(MigrationAuditLog)
class MigrationAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "batch", "actor", "created_at")
    list_filter = ("action",)
