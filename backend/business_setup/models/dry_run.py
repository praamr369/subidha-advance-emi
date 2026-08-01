"""Dry-run validation jobs (Phase G). Split out of subscriptions; table name preserved (state-only move)."""
from uuid import uuid4

from django.conf import settings
from django.db import models
from django.utils import timezone


class DryRunValidationJob(models.Model):
    """
    Stores metadata and results of admin Dry Run Control Center executions only.
    Never stores uploaded import/export payloads or personal data files.
    """

    class Status(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    run_id = models.UUIDField(default=uuid4, unique=True, editable=False, db_index=True)
    checks = models.JSONField(default=list)
    options = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.COMPLETED, db_index=True)
    summary = models.JSONField(default=dict)
    results = models.JSONField(default=list)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dry_run_validation_jobs",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "subscriptions_dry_run_validation_jobs"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"DryRunJob {self.run_id} [{self.status}]"

