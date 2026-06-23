from django.contrib import admin

from accounts.models import Capability, RoleCapability, StaffIdentity, UserCapabilityOverride


@admin.register(StaffIdentity)
class StaffIdentityAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "employee", "login_enabled", "created_at")
    list_filter = ("login_enabled",)
    search_fields = ("user__username", "employee__id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Capability)
class CapabilityAdmin(admin.ModelAdmin):
    list_display = ("code", "label", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "label")
    ordering = ("code",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(RoleCapability)
class RoleCapabilityAdmin(admin.ModelAdmin):
    list_display = ("role", "capability", "is_allowed", "created_at")
    list_filter = ("role", "is_allowed")
    search_fields = ("capability__code",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(UserCapabilityOverride)
class UserCapabilityOverrideAdmin(admin.ModelAdmin):
    list_display = ("user", "capability", "is_allowed", "note", "created_at")
    list_filter = ("is_allowed",)
    search_fields = ("user__username", "capability__code")
    readonly_fields = ("created_at", "updated_at")
