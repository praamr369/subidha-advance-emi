"""
P2B — Cash Counter Session and Daily Close models.

Additive. No existing model, migration, or service is touched.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone
from payments.models import CashDeskTimeStampedModel, DailyCloseRun


MONEY_ZERO_STR = "0.00"


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


# ─────────────────────────────────────────────
# DailyCloseRun
# ─────────────────────────────────────────────

class DailyCloseStatus(models.TextChoices):
    DRY_RUN = "DRY_RUN", "Dry Run"
    EXECUTED = "EXECUTED", "Executed"
    BLOCKED = "BLOCKED", "Blocked"


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

from payments.models import CashCounterSession, DailyCloseRun
