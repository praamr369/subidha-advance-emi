"""
P2C — Month-end close run and check result models.

Additive. No existing table is touched.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class MonthEndCloseStatus(models.TextChoices):
    DRY_RUN = "DRY_RUN", "Dry Run"
    EXECUTED = "EXECUTED", "Executed"
    BLOCKED = "BLOCKED", "Blocked"


class MonthEndCheckSeverity(models.TextChoices):
    INFO = "INFO", "Info"
    WARNING = "WARNING", "Warning"
    BLOCKING = "BLOCKING", "Blocking"


class MonthEndCloseRun(models.Model):
    """One month-end close attempt (dry-run or executed) for a period/branch."""

    period_year = models.PositiveSmallIntegerField(db_index=True)
    period_month = models.PositiveSmallIntegerField(db_index=True)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="month_end_close_runs",
    )
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="month_end_close_runs",
    )
    is_dry_run = models.BooleanField(default=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=MonthEndCloseStatus.choices,
        default=MonthEndCloseStatus.DRY_RUN,
        db_index=True,
    )
    run_at = models.DateTimeField(default=timezone.now, db_index=True)
    notes = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "control_month_end_close_runs"
        ordering = ["-run_at", "-id"]
        indexes = [
            models.Index(fields=["period_year", "period_month", "status"]),
            models.Index(fields=["period_year", "period_month", "is_dry_run"]),
        ]

    def __str__(self) -> str:
        return f"MonthEndCloseRun {self.period_year}-{self.period_month:02d} {self.status} (id={self.pk})"


class MonthEndCloseCheckResult(models.Model):
    """One check result row inside a MonthEndCloseRun."""

    run = models.ForeignKey(
        MonthEndCloseRun,
        on_delete=models.CASCADE,
        related_name="check_results",
    )
    check_key = models.CharField(max_length=80, db_index=True)
    severity = models.CharField(
        max_length=10,
        choices=MonthEndCheckSeverity.choices,
        default=MonthEndCheckSeverity.INFO,
        db_index=True,
    )
    passed = models.BooleanField(default=True, db_index=True)
    count = models.IntegerField(default=0)
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "control_month_end_close_check_results"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["run", "severity", "passed"]),
        ]

    def __str__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return f"{self.check_key} [{self.severity}] {status}"
