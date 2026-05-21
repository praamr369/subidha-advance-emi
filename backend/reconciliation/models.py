from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class ReconciliationRunStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


class ReconciliationSeverity(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class ReconciliationItemStatus(models.TextChoices):
    MATCHED = "MATCHED", "Matched"
    MISSING_LEDGER = "MISSING_LEDGER", "Missing Ledger"
    MISSING_SOURCE = "MISSING_SOURCE", "Missing Source"
    AMOUNT_MISMATCH = "AMOUNT_MISMATCH", "Amount Mismatch"
    QUANTITY_MISMATCH = "QUANTITY_MISMATCH", "Quantity Mismatch"
    STATUS_MISMATCH = "STATUS_MISMATCH", "Status Mismatch"
    DUPLICATE_POSTING = "DUPLICATE_POSTING", "Duplicate Posting"
    WRONG_ACCOUNT = "WRONG_ACCOUNT", "Wrong Account"
    NEEDS_REVIEW = "NEEDS_REVIEW", "Needs Review"
    RESOLVED = "RESOLVED", "Resolved"
    FALSE_POSITIVE = "FALSE_POSITIVE", "False Positive"
    WAIVED_BY_APPROVAL = "WAIVED_BY_APPROVAL", "Waived By Approval"


class ReconciliationResolutionAction(models.TextChoices):
    MARK_REVIEWED = "MARK_REVIEWED", "Mark Reviewed"
    MARK_FALSE_POSITIVE = "MARK_FALSE_POSITIVE", "Mark False Positive"
    REQUEST_CORRECTION = "REQUEST_CORRECTION", "Request Correction"
    LINK_EXISTING_RECORD = "LINK_EXISTING_RECORD", "Link Existing Record"
    CREATE_ADJUSTMENT_REQUEST = "CREATE_ADJUSTMENT_REQUEST", "Create Adjustment Request"
    ESCALATE = "ESCALATE", "Escalate"
    CLOSE = "CLOSE", "Close"
    REOPEN = "REOPEN", "Reopen"


class ReconciliationRun(models.Model):
    run_no = models.PositiveIntegerField(unique=True, db_index=True)
    scope = models.CharField(max_length=80, db_index=True)
    module = models.CharField(max_length=80, db_index=True)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reconciliation_runs",
    )
    date_from = models.DateField(null=True, blank=True)
    date_to = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=12,
        choices=ReconciliationRunStatus.choices,
        default=ReconciliationRunStatus.PENDING,
        db_index=True,
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="started_reconciliation_runs",
    )
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True, db_index=True)
    total_checked = models.PositiveIntegerField(default=0)
    total_matched = models.PositiveIntegerField(default=0)
    total_exceptions = models.PositiveIntegerField(default=0)
    high_risk_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "reconciliation_runs"
        ordering = ["-started_at", "-id"]
        indexes = [
            models.Index(fields=["module", "scope", "status"]),
            models.Index(fields=["started_at"]),
        ]

    def __str__(self) -> str:
        return f"Run {self.run_no} ({self.module})"


class ReconciliationItem(models.Model):
    run = models.ForeignKey(
        ReconciliationRun,
        on_delete=models.CASCADE,
        related_name="items",
    )
    module = models.CharField(max_length=80, db_index=True)
    source_type = models.CharField(max_length=100, db_index=True)
    source_id = models.CharField(max_length=120, db_index=True)
    source_label = models.CharField(max_length=255, blank=True, default="")

    expected_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    amount_delta = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expected_quantity = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    actual_quantity = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)

    severity = models.CharField(
        max_length=10,
        choices=ReconciliationSeverity.choices,
        default=ReconciliationSeverity.MEDIUM,
        db_index=True,
    )
    status = models.CharField(
        max_length=30,
        choices=ReconciliationItemStatus.choices,
        default=ReconciliationItemStatus.NEEDS_REVIEW,
        db_index=True,
    )

    exception_code = models.CharField(max_length=80, blank=True, default="", db_index=True)
    exception_message = models.TextField(blank=True, default="")
    recommended_action = models.TextField(blank=True, default="")

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assigned_reconciliation_items",
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="resolved_reconciliation_items",
    )
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)

    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reconciliation_items"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["run", "module"]),
            models.Index(fields=["status", "severity"]),
            models.Index(fields=["exception_code"]),
            models.Index(fields=["source_type", "source_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["run", "module", "exception_code", "source_type", "source_id"],
                name="reconciliation_unique_item_per_run",
            )
        ]

    def __str__(self) -> str:
        return f"{self.exception_code or self.status}: {self.source_type}#{self.source_id}"


class ReconciliationEvidence(models.Model):
    item = models.ForeignKey(
        ReconciliationItem,
        on_delete=models.CASCADE,
        related_name="evidence",
    )
    evidence_type = models.CharField(max_length=80, db_index=True)
    content_type = models.ForeignKey(
        "contenttypes.ContentType",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reconciliation_evidence",
    )
    object_id = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    label = models.CharField(max_length=255, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    status = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "reconciliation_evidence"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["evidence_type", "object_id"]),
        ]


class ReconciliationResolution(models.Model):
    item = models.ForeignKey(
        ReconciliationItem,
        on_delete=models.CASCADE,
        related_name="resolutions",
    )
    action = models.CharField(
        max_length=40,
        choices=ReconciliationResolutionAction.choices,
        db_index=True,
    )
    note = models.TextField()
    before_status = models.CharField(max_length=30, blank=True, default="")
    after_status = models.CharField(max_length=30, blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reconciliation_resolutions",
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "reconciliation_resolutions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["action", "created_at"]),
        ]

