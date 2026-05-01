from django.contrib import admin

from system_jobs.models import Notification, NotificationPreference, SystemJobLog


@admin.register(SystemJobLog)
class SystemJobLogAdmin(admin.ModelAdmin):
    list_display = ("id", "job_type", "status", "idempotency_key", "retry_count", "started_at", "finished_at")
    search_fields = ("idempotency_key", "job_type", "failure_reason")
    list_filter = ("status", "job_type")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "recipient", "module", "title", "read_at", "created_at")
    search_fields = ("title", "body", "module")
    list_filter = ("module",)


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "module", "enabled", "updated_at")
