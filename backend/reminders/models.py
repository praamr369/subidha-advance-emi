from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from billing.models import BillingInvoice
from subscriptions.models import Customer, Payment, Subscription

MONEY_ZERO = Decimal("0.00")


def generate_reminder_no() -> str:
    return f"REM-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


class ReminderTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ReminderChannel(models.TextChoices):
    SMS = "SMS", "SMS"
    WHATSAPP = "WHATSAPP", "WhatsApp"
    EMAIL = "EMAIL", "Email"
    CALL = "CALL", "Call"
    INTERNAL = "INTERNAL", "Internal"


class ReminderType(models.TextChoices):
    RETAIL_DUE = "RETAIL_DUE", "Retail Due"
    EMI_DUE = "EMI_DUE", "EMI Due"
    EMI_OVERDUE = "EMI_OVERDUE", "EMI Overdue"
    RENT_DUE = "RENT_DUE", "Rent / Lease Due"
    FOLLOWUP = "FOLLOWUP", "Follow Up"


class ReminderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING = "PENDING", "Pending"
    SCHEDULED = "SCHEDULED", "Scheduled"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    CANCELLED = "CANCELLED", "Cancelled"


class PaymentReminder(ReminderTimeStampedModel):
    reminder_no = models.CharField(
        max_length=40,
        db_index=True,
        default=generate_reminder_no,
    )
    channel = models.CharField(max_length=20, choices=ReminderChannel.choices, db_index=True)
    reminder_type = models.CharField(max_length=20, choices=ReminderType.choices, db_index=True)
    target_customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reminders",
    )
    target_subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reminders",
    )
    target_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reminders",
    )
    target_payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reminders",
    )
    due_date = models.DateField(db_index=True)
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(MONEY_ZERO)])
    status = models.CharField(
        max_length=20,
        choices=ReminderStatus.choices,
        default=ReminderStatus.DRAFT,
        db_index=True,
    )
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sent_payment_reminders",
    )
    notes = models.TextField(blank=True, default="")
    template_key = models.CharField(max_length=80, blank=True, default="")
    customer_contact = models.CharField(max_length=120, blank=True, default="")
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "payment_reminders"
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["status", "scheduled_for", "due_date"]),
            models.Index(fields=["target_customer", "due_date"]),
            models.Index(fields=["target_subscription", "due_date"]),
            models.Index(fields=["target_invoice", "due_date"]),
        ]

    def __str__(self):
        return f"Rem#{self.reminder_no} [{self.channel}] due:{self.due_date}"

    def clean(self):
        errors = {}
        if self.target_subscription_id and self.target_customer_id:
            if self.target_subscription.customer_id != self.target_customer_id:
                errors["target_customer"] = "Reminder customer must match the linked subscription."
        if self.target_invoice_id and self.target_customer_id:
            if self.target_invoice.customer_id and self.target_invoice.customer_id != self.target_customer_id:
                errors["target_customer"] = "Reminder customer must match the linked invoice."
        if self.target_payment_id and self.target_customer_id:
            if self.target_payment.customer_id != self.target_customer_id:
                errors["target_customer"] = "Reminder customer must match the linked payment."
        if self.status == ReminderStatus.SCHEDULED and self.scheduled_for is None:
            errors["scheduled_for"] = "Scheduled reminders must include a schedule time."
        if self.status == ReminderStatus.SENT and self.sent_at is None:
            errors["sent_at"] = "Sent reminders must include sent_at."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reminder_no = (self.reminder_no or generate_reminder_no()).strip().upper()
        self.notes = (self.notes or "").strip()
        self.template_key = (self.template_key or "").strip().upper()
        self.customer_contact = (self.customer_contact or "").strip()
        self.last_error = (self.last_error or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class NotificationTemplate(ReminderTimeStampedModel):
    """Editable message templates used for email/WhatsApp/SMS reminders.

    Placeholders: {name}, {amount}, {due_date}, {ref}, {company}.
    """
    key = models.CharField(max_length=80, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    channel = models.CharField(max_length=20, choices=ReminderChannel.choices)
    subject = models.CharField(max_length=200, blank=True, default="")
    body = models.TextField()
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "reminders_notification_templates"
        ordering = ["channel", "key"]

    def __str__(self):
        return f"{self.key} ({self.channel})"

    def save(self, *args, **kwargs):
        self.key = (self.key or "").strip().upper().replace(" ", "_")
        self.name = (self.name or "").strip()
        self.subject = (self.subject or "").strip()
        self.body = (self.body or "").strip()
        super().save(*args, **kwargs)

    def render_preview(self, **context) -> dict:
        """Return rendered subject+body with sample data for preview."""
        sample = {
            "name": context.get("name", "Rahul Kumar"),
            "amount": context.get("amount", "5,000.00"),
            "due_date": context.get("due_date", "15 Jul 2026"),
            "ref": context.get("ref", "SUB-2026-0001"),
            "company": context.get("company", "SUBIDHA"),
        }
        try:
            rendered_subject = self.subject.format(**sample) if self.subject else ""
        except (KeyError, IndexError):
            rendered_subject = self.subject
        try:
            rendered_body = self.body.format(**sample)
        except (KeyError, IndexError):
            rendered_body = self.body
        return {
            "subject": rendered_subject,
            "body": rendered_body,
            "placeholders_used": sample,
        }
