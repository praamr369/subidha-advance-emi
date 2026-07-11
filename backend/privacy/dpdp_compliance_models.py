"""
CTRL-DPDP-3/5/8 — Erasure Guard, Breach Notification, Data Retention Schedule.
These models live in a separate file and are imported into privacy/models.py
to keep the file manageable.
"""
from django.db import models
from django.conf import settings
from django.utils import timezone


# ---------------------------------------------------------------------------
# CTRL-DPDP-3 — DataErasureGuard
# ---------------------------------------------------------------------------

class ErasureRequestStatus(models.TextChoices):
    RECEIVED = "RECEIVED", "Received"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED", "Partially Completed"
    COMPLETED = "COMPLETED", "Completed"
    REJECTED = "REJECTED", "Rejected"


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class DataErasureGuard(TimeStampedModel):
    """CTRL-DPDP-3 — DPDP 2023 s.12 erasure request record."""
    customer = models.ForeignKey(
        'subscriptions.Customer',
        on_delete=models.PROTECT,
        related_name='erasure_requests',
    )
    status = models.CharField(
        max_length=25,
        choices=ErasureRequestStatus.choices,
        default=ErasureRequestStatus.RECEIVED,
        db_index=True,
    )
    request_reference = models.CharField(max_length=40, unique=True, db_index=True)
    requested_at = models.DateTimeField(auto_now_add=True, db_index=True)
    due_date = models.DateField(
        help_text="Statutory deadline: 30 days from request (DPDP 2023 s.12).",
    )
    fields_to_erase = models.JSONField(
        default=list,
        help_text="Data categories the customer wants erased.",
    )
    fields_retained = models.JSONField(
        default=list,
        help_text="Fields retained for legal obligation, with reasons.",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_erasure_requests',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_erasure_requests',
    )
    rejection_reason = models.TextField(blank=True, default="")
    audit_notes = models.TextField(blank=True, default="")

    class Meta:
        app_label = 'privacy'
        db_table = 'data_erasure_guards'
        ordering = ['-requested_at']

    def __str__(self):
        return f"Erasure {self.request_reference} [{self.status}]"

    @property
    def is_overdue(self) -> bool:
        from datetime import date
        return (
            self.status not in {ErasureRequestStatus.COMPLETED, ErasureRequestStatus.REJECTED}
            and date.today() > self.due_date
        )


# ---------------------------------------------------------------------------
# CTRL-DPDP-5 — BreachNotification
# ---------------------------------------------------------------------------

class BreachSeverity(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class BreachNotificationStatus(models.TextChoices):
    IDENTIFIED = "IDENTIFIED", "Identified"
    INVESTIGATING = "INVESTIGATING", "Investigating"
    NOTIFIED_BOARD = "NOTIFIED_BOARD", "Notified — Data Protection Board"
    NOTIFIED_PRINCIPALS = "NOTIFIED_PRINCIPALS", "Notified — Affected Principals"
    CLOSED = "CLOSED", "Closed"


class BreachNotification(TimeStampedModel):
    """CTRL-DPDP-5 — DPDP 2023 s.8 breach notification record."""
    breach_reference = models.CharField(max_length=40, unique=True, db_index=True)
    severity = models.CharField(
        max_length=20,
        choices=BreachSeverity.choices,
        default=BreachSeverity.MEDIUM,
        db_index=True,
    )
    status = models.CharField(
        max_length=30,
        choices=BreachNotificationStatus.choices,
        default=BreachNotificationStatus.IDENTIFIED,
        db_index=True,
    )
    detected_at = models.DateTimeField(db_index=True)
    description = models.TextField()
    data_categories_affected = models.JSONField(default=list)
    estimated_principals_affected = models.PositiveIntegerField(default=0)
    board_notified_at = models.DateTimeField(null=True, blank=True, db_index=True)
    principals_notified_at = models.DateTimeField(null=True, blank=True, db_index=True)
    containment_measures = models.TextField(blank=True, default="")
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reported_breaches',
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='closed_breaches',
    )

    class Meta:
        app_label = 'privacy'
        db_table = 'breach_notifications'
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['severity', 'status']),
            models.Index(fields=['detected_at']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        if not self.description:
            errors['description'] = 'Breach description is required.'
        if self.status == BreachNotificationStatus.NOTIFIED_BOARD and not self.board_notified_at:
            errors['board_notified_at'] = 'Board notification timestamp required.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Breach {self.breach_reference} [{self.severity}/{self.status}]"


# ---------------------------------------------------------------------------
# CTRL-DPDP-8 — DataRetentionSchedule
# ---------------------------------------------------------------------------

class PurgeJobStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Scheduled"
    AWAITING_APPROVAL = "AWAITING_APPROVAL", "Awaiting Approval"
    APPROVED = "APPROVED", "Approved"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class DataRetentionSchedule(TimeStampedModel):
    """CTRL-DPDP-8 — One execution instance of a data retention purge."""
    schedule_reference = models.CharField(max_length=40, unique=True, db_index=True)
    data_category = models.CharField(max_length=60, db_index=True)
    status = models.CharField(
        max_length=25,
        choices=PurgeJobStatus.choices,
        default=PurgeJobStatus.SCHEDULED,
        db_index=True,
    )
    scheduled_purge_date = models.DateField(db_index=True)
    records_targeted = models.PositiveIntegerField(default=0)
    records_purged = models.PositiveIntegerField(default=0)
    retention_policy_reference = models.CharField(max_length=100, blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_purge_jobs',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    executed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='executed_purge_jobs',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")
    execution_log = models.JSONField(default=list, blank=True)

    class Meta:
        app_label = 'privacy'
        db_table = 'data_retention_schedules'
        ordering = ['-scheduled_purge_date']
        indexes = [
            models.Index(fields=['status', 'scheduled_purge_date']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        if self.status == PurgeJobStatus.APPROVED and not self.approved_by_id:
            errors['approved_by'] = 'Approving officer required.'
        if self.status == PurgeJobStatus.COMPLETED and not self.completed_at:
            errors['completed_at'] = 'Completion timestamp required.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PurgeJob {self.schedule_reference} [{self.data_category}/{self.status}]"
