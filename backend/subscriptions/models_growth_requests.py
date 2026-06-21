"""
P5B — Renewal / Upgrade / Exchange Request Workflow.

Additive. No existing model, service, or migration touched.
Request lifecycle only — no subscription mutation, no stock mutation,
no EMI recalculation, no payment/accounting/bridge record creation.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class GrowthRequestType(models.TextChoices):
    RENEWAL = "RENEWAL", "Renewal"
    UPGRADE = "UPGRADE", "Upgrade"
    EXCHANGE = "EXCHANGE", "Exchange"
    PLAN_CONVERSION = "PLAN_CONVERSION", "Plan Conversion"
    EARLY_DELIVERY_INTEREST = "EARLY_DELIVERY_INTEREST", "Early Delivery Interest"
    RENT_TO_LEASE_INTEREST = "RENT_TO_LEASE_INTEREST", "Rent-to-Lease Interest"
    LEASE_TO_PURCHASE_INTEREST = "LEASE_TO_PURCHASE_INTEREST", "Lease-to-Purchase Interest"


class GrowthRequestStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"
    CONVERTED = "CONVERTED", "Converted"


class GrowthRequestPriority(models.TextChoices):
    LOW = "LOW", "Low"
    NORMAL = "NORMAL", "Normal"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


_TERMINAL_STATUSES = frozenset({
    GrowthRequestStatus.APPROVED,
    GrowthRequestStatus.REJECTED,
    GrowthRequestStatus.CANCELLED,
    GrowthRequestStatus.CONVERTED,
})


class CustomerGrowthRequest(models.Model):
    """
    A customer request for renewal, upgrade, exchange, or plan conversion.

    Lifecycle: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / CANCELLED.
    CONVERTED is set when an admin manually records that a new contract was
    created (not automatic).

    No subscription, EMI, payment, or accounting record is created or mutated
    by this model or its service layer.
    """

    request_number = models.CharField(max_length=40, unique=True, db_index=True)

    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        db_index=True,
    )
    source_subscription = models.ForeignKey(
        "subscriptions.Subscription",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        null=True,
        blank=True,
        db_index=True,
    )

    request_type = models.CharField(
        max_length=30,
        choices=GrowthRequestType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=14,
        choices=GrowthRequestStatus.choices,
        default=GrowthRequestStatus.DRAFT,
        db_index=True,
    )
    priority = models.CharField(
        max_length=8,
        choices=GrowthRequestPriority.choices,
        default=GrowthRequestPriority.NORMAL,
        db_index=True,
    )

    desired_plan_template = models.ForeignKey(
        "subscriptions.PlanTemplate",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        null=True,
        blank=True,
    )
    desired_offer_package = models.ForeignKey(
        "subscriptions.OfferPackage",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        null=True,
        blank=True,
    )
    requested_product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.PROTECT,
        related_name="growth_requests_as_requested",
        null=True,
        blank=True,
    )
    current_product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.PROTECT,
        related_name="growth_requests_as_current",
        null=True,
        blank=True,
    )

    expected_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    risk_snapshot = models.JSONField(default=dict, blank=True)
    approval_required = models.BooleanField(default=False, db_index=True)

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="growth_requests_approved",
        null=True,
        blank=True,
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="growth_requests_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="growth_requests_updated",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "growth_customer_requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "status"], name="growth_req_cust_status_idx"),
            models.Index(fields=["status", "priority"], name="growth_req_status_priority_idx"),
            models.Index(fields=["request_type", "status"], name="growth_req_type_status_idx"),
        ]

    def __str__(self):
        return f"GrowthRequest[{self.request_number}] {self.request_type}/{self.status}"

    @property
    def is_terminal(self):
        return self.status in _TERMINAL_STATUSES


# ─────────────────────────────────────────────
# GrowthRequestLine
# ─────────────────────────────────────────────

class GrowthRequestLineType(models.TextChoices):
    PRODUCT = "PRODUCT", "Product"
    SERVICE = "SERVICE", "Service"
    DISCOUNT = "DISCOUNT", "Discount"
    NOTE = "NOTE", "Note"


class GrowthRequestLine(models.Model):
    """Optional line item within a CustomerGrowthRequest."""

    growth_request = models.ForeignKey(
        CustomerGrowthRequest,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    line_type = models.CharField(
        max_length=10,
        choices=GrowthRequestLineType.choices,
        default=GrowthRequestLineType.PRODUCT,
    )
    product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.PROTECT,
        related_name="growth_request_lines",
        null=True,
        blank=True,
    )
    quantity = models.PositiveIntegerField(default=1)
    proposed_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "growth_request_lines"
        ordering = ["growth_request_id", "id"]

    def __str__(self):
        return f"GrowthRequestLine[{self.growth_request_id}:{self.line_type}]"


# ─────────────────────────────────────────────
# GrowthRequestDecision
# ─────────────────────────────────────────────

class GrowthDecisionType(models.TextChoices):
    APPROVE = "APPROVE", "Approve"
    REJECT = "REJECT", "Reject"
    REQUEST_MORE_INFO = "REQUEST_MORE_INFO", "Request More Info"
    CANCEL = "CANCEL", "Cancel"


class GrowthRequestDecision(models.Model):
    """Audit trail of decisions made on a CustomerGrowthRequest."""

    growth_request = models.ForeignKey(
        CustomerGrowthRequest,
        on_delete=models.CASCADE,
        related_name="decisions",
    )
    decision = models.CharField(max_length=20, choices=GrowthDecisionType.choices)
    reason = models.TextField(blank=True, default="")
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="growth_request_decisions",
    )
    decided_at = models.DateTimeField(default=timezone.now)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "growth_request_decisions"
        ordering = ["-decided_at"]

    def __str__(self):
        return f"GrowthDecision[{self.growth_request_id}:{self.decision}]"
