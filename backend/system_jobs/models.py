from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class SystemJobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    RUNNING = "RUNNING", "Running"
    SUCCESS = "SUCCESS", "Success"
    FAILED = "FAILED", "Failed"


class NotificationAudience(models.TextChoices):
    """Who may read a notification when recipient is null (broadcast)."""

    ADMINS = "ADMINS", "Admins"
    CASHIERS = "CASHIERS", "Cashiers"


class SystemJobLog(models.Model):
    """
    Durable record of background work for retries, audits, and admin visibility.
    """

    idempotency_key = models.CharField(max_length=220, unique=True, db_index=True)
    job_type = models.CharField(max_length=80, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=SystemJobStatus.choices,
        default=SystemJobStatus.PENDING,
        db_index=True,
    )
    retry_count = models.PositiveIntegerField(default=0)
    failure_reason = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True, db_index=True)
    result_summary = models.JSONField(default=dict, blank=True)
    celery_task_id = models.CharField(max_length=120, blank=True, default="")

    class Meta:
        db_table = "system_job_logs"
        ordering = ["-started_at", "-id"]
        indexes = [
            models.Index(fields=["job_type", "status"]),
            models.Index(fields=["finished_at"]),
        ]

    def __str__(self):
        return f"{self.job_type}:{self.idempotency_key}"


class Notification(models.Model):
    """
    In-app notification. Finance posting must never depend on this model.
    """

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="system_notifications",
    )
    audience = models.CharField(
        max_length=16,
        choices=NotificationAudience.choices,
        blank=True,
        default="",
        db_index=True,
    )
    module = models.CharField(max_length=48, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    dedupe_key = models.CharField(max_length=220, null=True, blank=True, unique=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    source_job = models.ForeignKey(
        SystemJobLog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "system_notifications"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "read_at"]),
            models.Index(fields=["module", "created_at"]),
        ]

    def mark_read(self):
        if self.read_at is None:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at"])


class NotificationPreference(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    module = models.CharField(max_length=48, db_index=True)
    enabled = models.BooleanField(default=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "system_notification_preferences"
        unique_together = (("user", "module"),)
        ordering = ["user_id", "module"]
