"""
P2B — Cash Counter Session and Daily Close models.

Additive. No existing model, migration, or service is touched.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


MONEY_ZERO_STR = "0.00"


class CashDeskTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ─────────────────────────────────────────────
# CashCounterSession
# ─────────────────────────────────────────────

class CashCounterSessionStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    CLOSED = "CLOSED", "Closed"
    VARIANCE_PENDING_APPROVAL = "VARIANCE_PENDING_APPROVAL", "Variance Pending Approval"
    APPROVED_VARIANCE = "APPROVED_VARIANCE", "Approved Variance"
    CANCELLED = "CANCELLED", "Cancelled"


_IMMUTABLE_STATUSES = frozenset({
    CashCounterSessionStatus.CLOSED,
    CashCounterSessionStatus.APPROVED_VARIANCE,
    CashCounterSessionStatus.CANCELLED,
})


class CashCounterSession(CashDeskTimeStampedModel):
    """One cashier's shift on one cash counter for one date."""

    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        related_name="cash_counter_sessions",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_counter_sessions",
    )

    session_date = models.DateField(db_index=True)
    opened_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)

    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    declared_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    variance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(
        max_length=28,
        choices=CashCounterSessionStatus.choices,
        default=CashCounterSessionStatus.OPEN,
        db_index=True,
    )

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_opened",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_closed",
        null=True,
        blank=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_approved",
        null=True,
        blank=True,
    )

    # FK to the P2A approval request if variance required one
    variance_approval_request_id = models.IntegerField(null=True, blank=True)

    notes = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_cash_counter_sessions"
        ordering = ["-session_date", "-opened_at", "-id"]
        indexes = [
            models.Index(fields=["session_date", "status"], name="ctrl_ccs_date_status_idx"),
            models.Index(fields=["cash_counter", "session_date"], name="ctrl_ccs_counter_date_idx"),
            models.Index(fields=["cashier", "session_date"], name="ctrl_ccs_cashier_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["cash_counter", "cashier", "session_date"],
                condition=models.Q(status="OPEN"),
                name="ctrl_ccs_unique_open_per_counter_cashier_date",
            ),
        ]

    def __str__(self):
        return (
            f"CashCounterSession[{self.cash_counter_id}] {self.session_date} "
            f"cashier={self.cashier_id} status={self.status}"
        )


# ─────────────────────────────────────────────
# DailyCloseRun
# ─────────────────────────────────────────────

class DailyCloseStatus(models.TextChoices):
    DRY_RUN = "DRY_RUN", "Dry Run"
    EXECUTED = "EXECUTED", "Executed"
    BLOCKED = "BLOCKED", "Blocked"


class DailyCloseRun(CashDeskTimeStampedModel):
    """One daily close readiness check or execution run."""

    run_date = models.DateField(db_index=True)
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="daily_close_runs",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="daily_close_runs",
    )

    is_dry_run = models.BooleanField(default=True)
    status = models.CharField(
        max_length=10,
        choices=DailyCloseStatus.choices,
        default=DailyCloseStatus.DRY_RUN,
        db_index=True,
    )

    blocking_check_count = models.IntegerField(default=0)
    executed_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_daily_close_runs"
        ordering = ["-run_date", "-created_at"]
        indexes = [
            models.Index(fields=["run_date", "status"], name="ctrl_dcr_date_status_idx"),
        ]

    def __str__(self):
        return f"DailyCloseRun[{self.run_date}] is_dry_run={self.is_dry_run} status={self.status}"


# ─────────────────────────────────────────────
# DailyCloseCheckResult
# ─────────────────────────────────────────────

class DailyCloseCheckSeverity(models.TextChoices):
    INFO = "INFO", "Info"
    WARNING = "WARNING", "Warning"
    BLOCKING = "BLOCKING", "Blocking"


class DailyCloseCheckResult(CashDeskTimeStampedModel):
    """One check line in a DailyCloseRun."""

    close_run = models.ForeignKey(
        DailyCloseRun,
        on_delete=models.CASCADE,
        related_name="check_results",
    )
    check_key = models.CharField(max_length=80, db_index=True)
    label = models.CharField(max_length=240)
    passed = models.BooleanField(default=False)
    severity = models.CharField(
        max_length=10,
        choices=DailyCloseCheckSeverity.choices,
        default=DailyCloseCheckSeverity.BLOCKING,
    )
    detail = models.TextField(blank=True, default="")

    class Meta:
        db_table = "control_daily_close_check_results"
        ordering = ["close_run", "id"]
        indexes = [
            models.Index(fields=["close_run", "passed"], name="ctrl_dccr_run_passed_idx"),
        ]

    def __str__(self):
        icon = "PASS" if self.passed else "FAIL"
        return f"[{icon}] {self.check_key} ({self.severity})"
