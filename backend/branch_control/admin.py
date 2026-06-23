from django.contrib import admin

from branch_control.models import Branch, CashCounter


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("branch_code", "name", "city", "is_active", "is_head_office", "created_at")
    list_filter = ("is_active", "is_head_office", "city")
    search_fields = ("branch_code", "name", "city", "address")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("branch_code",)


@admin.register(CashCounter)
class CashCounterAdmin(admin.ModelAdmin):
    list_display = ("counter_code", "name", "branch", "is_active", "created_at")
    list_filter = ("is_active", "branch")
    search_fields = ("counter_code", "name", "branch__name")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("branch", "counter_code")
