from django.contrib import admin

from reminders.models import PaymentReminder


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

