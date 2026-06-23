from django.contrib import admin

from branch_control.models import Branch, CashCounter


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "status", "is_primary", "created_at")
    list_filter = ("status", "is_primary")
    search_fields = ("code", "name", "address")
    ordering = ("name",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(CashCounter)
class CashCounterAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "branch", "is_active", "created_at")
    list_filter = ("is_active", "branch")
    search_fields = ("code", "name", "branch__name")
    ordering = ("branch__name", "name")
    readonly_fields = ("created_at", "updated_at")
