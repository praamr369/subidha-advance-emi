from django.contrib import admin

from service_desk.models import ServiceDeskCase, ServiceDeskCaseLine


class ServiceDeskCaseLineInline(admin.TabularInline):
    model = ServiceDeskCaseLine
    extra = 0


@admin.register(ServiceDeskCase)
class ServiceDeskCaseAdmin(admin.ModelAdmin):
    list_display = (
        "case_no",
        "case_type",
        "status",
        "priority",
        "party",
        "billing_invoice",
        "finance_status",
        "stock_status",
        "created_at",
    )
    list_filter = ("case_type", "status", "priority", "finance_status", "stock_status")
    search_fields = (
        "case_no",
        "issue_summary",
        "reporter_name_snapshot",
        "reporter_phone_snapshot",
    )
    inlines = [ServiceDeskCaseLineInline]

