from unfold.admin import ModelAdmin as UnfoldModelAdmin, TabularInline as UnfoldTabularInline, StackedInline as UnfoldStackedInline
from django.contrib import admin

from accounts.models import (
    Capability,
    LoginAudit,
    RoleCapability,
    StaffIdentity,
    TOTPDevice,
    UserCapabilityOverride,
    UserSession,
)


@admin.register(StaffIdentity)
class StaffIdentityAdmin(UnfoldModelAdmin):
    list_display = ("id", "user", "employee", "login_enabled", "created_at")
    list_filter = ("login_enabled",)
    search_fields = ("user__username", "employee__id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Capability)
class CapabilityAdmin(UnfoldModelAdmin):
    list_display = ("code", "label", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "label")
    ordering = ("code",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(RoleCapability)
class RoleCapabilityAdmin(UnfoldModelAdmin):
    list_display = ("role", "capability", "is_allowed", "created_at")
    list_filter = ("role", "is_allowed")
    search_fields = ("capability__code",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(UserCapabilityOverride)
class UserCapabilityOverrideAdmin(UnfoldModelAdmin):
    list_display = ("user", "capability", "is_allowed", "note", "created_at")
    list_filter = ("is_allowed",)
    search_fields = ("user__username", "capability__code")
    readonly_fields = ("created_at", "updated_at")


@admin.register(TOTPDevice)
class TOTPDeviceAdmin(UnfoldModelAdmin):
    list_display = ("id", "user", "is_verified", "created_at", "updated_at")
    list_filter = ("is_verified",)
    search_fields = ("user__username", "user__phone", "user__email")
    readonly_fields = ("created_at", "updated_at")


@admin.register(LoginAudit)
class LoginAuditAdmin(UnfoldModelAdmin):
    list_display = ("id", "user", "status", "ip_address", "timestamp")
    list_filter = ("status",)
    search_fields = ("user__username", "ip_address")
    readonly_fields = ("timestamp",)


@admin.register(UserSession)
class UserSessionAdmin(UnfoldModelAdmin):
    list_display = ("id", "user", "device_name", "ip_address", "is_active", "created_at", "last_active_at")
    list_filter = ("is_active",)
    search_fields = ("user__username", "ip_address", "device_name")
    readonly_fields = ("created_at", "last_active_at")
