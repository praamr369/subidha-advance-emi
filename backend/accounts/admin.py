from django.contrib import admin

from accounts.models import Capability, RoleCapability, StaffIdentity, UserCapabilityOverride


@admin.register(StaffIdentity)
class StaffIdentityAdmin(admin.ModelAdmin):
    list_display = ("user", "staff_code", "display_name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("user__username", "staff_code", "display_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Capability)
class CapabilityAdmin(admin.ModelAdmin):
    list_display = ("code", "label", "module", "description", "is_active")
    list_filter = ("module", "is_active")
    search_fields = ("code", "label", "module")
    ordering = ("module", "code")


@admin.register(RoleCapability)
class RoleCapabilityAdmin(admin.ModelAdmin):
    list_display = ("role", "capability", "is_granted", "granted_at")
    list_filter = ("role", "is_granted")
    search_fields = ("role", "capability__code")
    readonly_fields = ("granted_at",)


@admin.register(UserCapabilityOverride)
class UserCapabilityOverrideAdmin(admin.ModelAdmin):
    list_display = ("user", "capability", "is_granted", "reason", "created_at")
    list_filter = ("is_granted",)
    search_fields = ("user__username", "capability__code", "reason")
    readonly_fields = ("created_at",)
