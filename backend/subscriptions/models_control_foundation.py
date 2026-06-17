"""
P2A — Enterprise Control Foundation: ApprovalRequest, BusinessPolicy, ControlException.

Additive. No existing model, service, or migration touched.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class ControlTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ─────────────────────────────────────────────
# ApprovalRequest
# ─────────────────────────────────────────────

class ApprovalStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    EXPIRED = "EXPIRED", "Expired"
    CANCELLED = "CANCELLED", "Cancelled"


class ApprovalRiskLevel(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


_DECIDED_STATUSES = frozenset({ApprovalStatus.APPROVED, ApprovalStatus.REJECTED})


class ApprovalRequest(ControlTimeStampedModel):
    """Maker-checker record for sensitive shop operations."""

    source_model = models.CharField(max_length=120, db_index=True)
    source_id = models.CharField(max_length=120, db_index=True)
    action_key = models.CharField(max_length=120, db_index=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approval_requests_made",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approval_requests_decided",
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=16,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING,
        db_index=True,
    )
    risk_level = models.CharField(
        max_length=10,
        choices=ApprovalRiskLevel.choices,
        default=ApprovalRiskLevel.MEDIUM,
        db_index=True,
    )

    before_snapshot = models.JSONField(default=dict, blank=True)
    after_snapshot = models.JSONField(default=dict, blank=True)

    request_reason = models.TextField(blank=True, default="")
    decision_reason = models.TextField(blank=True, default="")

    requested_at = models.DateTimeField(default=timezone.now, db_index=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_approval_requests"
        ordering = ["-requested_at", "-id"]
        indexes = [
            models.Index(fields=["status", "risk_level"], name="ctrl_appr_status_risk_idx"),
            models.Index(fields=["source_model", "source_id", "status"], name="ctrl_appr_src_status_idx"),
            models.Index(fields=["requested_by", "status"], name="ctrl_appr_reqby_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["source_model", "source_id", "action_key"],
                condition=models.Q(status="PENDING"),
                name="ctrl_appr_unique_pending_per_src_action",
            ),
        ]

    def clean(self):
        super().clean()
        if self.approved_by_id and self.approved_by_id == self.requested_by_id:
            if self.risk_level in (ApprovalRiskLevel.HIGH, ApprovalRiskLevel.CRITICAL):
                raise ValidationError(
                    {"approved_by": "Self-approval is not permitted for HIGH or CRITICAL risk actions."}
                )

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                prior = ApprovalRequest.objects.get(pk=self.pk)
                if prior.status in _DECIDED_STATUSES:
                    raise ValidationError(
                        f"ApprovalRequest {self.pk} is already {prior.status}. Decided requests are immutable."
                    )
            except ApprovalRequest.DoesNotExist:
                pass
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ApprovalRequest[{self.action_key}] src={self.source_model}#{self.source_id} status={self.status}"


# ─────────────────────────────────────────────
# BusinessPolicy
# ─────────────────────────────────────────────

class PolicyValueType(models.TextChoices):
    BOOL = "BOOL", "Boolean"
    INT = "INT", "Integer"
    DECIMAL = "DECIMAL", "Decimal"
    STRING = "STRING", "String"
    JSON = "JSON", "JSON"


class PolicyScopeType(models.TextChoices):
    GLOBAL = "GLOBAL", "Global"
    BRANCH = "BRANCH", "Branch"
    PLAN_TYPE = "PLAN_TYPE", "Plan Type"
    ROLE = "ROLE", "Role"


class BusinessPolicy(ControlTimeStampedModel):
    """Typed key/value runtime policy store.

    get_policy_value() is the canonical read path — never crashes on missing key.
    """

    key = models.CharField(max_length=120, db_index=True)
    value_type = models.CharField(max_length=10, choices=PolicyValueType.choices, default=PolicyValueType.BOOL)
    value = models.TextField()

    scope_type = models.CharField(
        max_length=12,
        choices=PolicyScopeType.choices,
        default=PolicyScopeType.GLOBAL,
        db_index=True,
    )
    scope_key = models.CharField(max_length=120, blank=True, default="", db_index=True)

    effective_from = models.DateTimeField(null=True, blank=True)
    effective_to = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="business_policies_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="business_policies_updated",
        null=True,
        blank=True,
    )

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_business_policies"
        ordering = ["key", "scope_type", "scope_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["key", "scope_type", "scope_key"],
                condition=models.Q(is_active=True),
                name="ctrl_policy_unique_active_key_scope",
            ),
        ]
        indexes = [
            models.Index(fields=["is_active", "key", "scope_type"], name="ctrl_pol_active_key_scope_idx"),
        ]

    def __str__(self):
        scope = f"{self.scope_type}:{self.scope_key}" if self.scope_key else self.scope_type
        return f"BusinessPolicy[{self.key}] scope={scope} active={self.is_active}"


# ─────────────────────────────────────────────
# ControlException
# ─────────────────────────────────────────────

class ExceptionSeverity(models.TextChoices):
    INFO = "INFO", "Info"
    WARNING = "WARNING", "Warning"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class ExceptionStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    RESOLVED = "RESOLVED", "Resolved"
    SUPPRESSED = "SUPPRESSED", "Suppressed"


class ControlException(ControlTimeStampedModel):
    """Persisted exception record with acknowledgement lifecycle.

    Exception detection is computed by the exception service; this model
    persists the acknowledgement/resolution state only.
    """

    exception_key = models.CharField(max_length=120, db_index=True)
    severity = models.CharField(
        max_length=10,
        choices=ExceptionSeverity.choices,
        default=ExceptionSeverity.WARNING,
        db_index=True,
    )

    source_model = models.CharField(max_length=120, db_index=True)
    source_id = models.CharField(max_length=120, db_index=True)

    title = models.CharField(max_length=240)
    message = models.TextField(blank=True, default="")
    action_url = models.CharField(max_length=500, blank=True, default="")

    detected_at = models.DateTimeField(default=timezone.now, db_index=True)

    status = models.CharField(
        max_length=14,
        choices=ExceptionStatus.choices,
        default=ExceptionStatus.OPEN,
        db_index=True,
    )

    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="acknowledged_control_exceptions",
        null=True,
        blank=True,
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_exceptions"
        ordering = ["-detected_at", "-id"]
        indexes = [
            models.Index(fields=["status", "severity"], name="ctrl_exc_status_severity_idx"),
            models.Index(fields=["exception_key", "status"], name="ctrl_exc_key_status_idx"),
            models.Index(fields=["source_model", "source_id"], name="ctrl_exc_source_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["exception_key", "source_model", "source_id"],
                condition=models.Q(status="OPEN"),
                name="ctrl_exc_unique_open_per_src",
            ),
        ]

    def __str__(self):
        return f"ControlException[{self.exception_key}] {self.severity} {self.status} src={self.source_model}#{self.source_id}"
