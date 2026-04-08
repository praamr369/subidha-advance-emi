from rest_framework import serializers

from reminders.models import PaymentReminder
from reminders.services.reminder_service import create_payment_reminder


class ReminderActionSerializer(serializers.Serializer):
    scheduled_for = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReminderRunSerializer(serializers.Serializer):
    due_date_on_or_before = serializers.DateField(required=False)
    send_now = serializers.BooleanField(required=False, default=False)


class PaymentReminderSerializer(serializers.ModelSerializer):
    target_customer_name = serializers.CharField(source="target_customer.name", read_only=True)
    target_subscription_id = serializers.IntegerField(source="target_subscription.id", read_only=True)
    target_invoice_no = serializers.CharField(source="target_invoice.document_no", read_only=True)
    target_payment_reference = serializers.CharField(source="target_payment.reference_no", read_only=True)
    sent_by_username = serializers.CharField(source="sent_by.username", read_only=True)

    class Meta:
        model = PaymentReminder
        fields = [
            "id",
            "reminder_no",
            "channel",
            "reminder_type",
            "target_customer",
            "target_customer_name",
            "target_subscription",
            "target_subscription_id",
            "target_invoice",
            "target_invoice_no",
            "target_payment",
            "target_payment_reference",
            "due_date",
            "amount_due",
            "status",
            "scheduled_for",
            "sent_at",
            "sent_by",
            "sent_by_username",
            "customer_contact",
            "attempts",
            "notes",
            "template_key",
            "last_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reminder_no",
            "status",
            "sent_at",
            "sent_by",
            "sent_by_username",
            "attempts",
            "last_error",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        return create_payment_reminder(
            performed_by=self.context["request"].user,
            **validated_data,
        )
