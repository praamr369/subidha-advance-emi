from django.contrib import admin

from reminders.models import PaymentReminder, NotificationTemplate


@admin.register(PaymentReminder)
class PaymentReminderAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "channel",
        "reminder_type",
        "status",
        "due_date",
        "scheduled_for",
        "amount_due",
    )
    list_filter = ("channel", "reminder_type", "status", "due_date")
    search_fields = ("notes", "template_key", "last_error")


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "name",
        "channel",
        "is_active",
        "created_at",
    )
    list_filter = ("channel", "is_active")
    search_fields = ("key", "name")
    readonly_fields = ("created_at", "updated_at")

