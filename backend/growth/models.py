"""Growth domain models (split out of the subscriptions app).

P5A — Growth Foundation: PlanTemplate, OfferPackage, OfferPackageLine.
P5B — Renewal / Upgrade / Exchange request workflow: CustomerGrowthRequest,
GrowthRequestLine, GrowthRequestDecision.

Additive-only domain. No subscription creation, EMI recalculation, stock
mutation, or financial record mutation. Tables keep their original names
(``growth_*``) so this move is state-only — see growth/migrations/0001_initial.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class GrowthTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ─────────────────────────────────────────────
# PlanTemplate
# ─────────────────────────────────────────────

class PlanTemplateType(models.TextChoices):
    EMI = "EMI", "EMI (Lucky Plan)"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"


class PlanTemplate(GrowthTimeStampedModel):
    """
    Reusable configuration blueprint for a Lucky EMI, RENT, or LEASE offer.

    Constraints:
    - RENT/LEASE templates must not require a lucky ID.
    - Security deposit percent applies to RENT/LEASE only.
    - Does not mutate existing Subscription records.
    """

    template_code = models.CharField(max_length=60, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")

    plan_type = models.CharField(
        max_length=8,
        choices=PlanTemplateType.choices,
        db_index=True,
    )

    tenure_months = models.PositiveSmallIntegerField(null=True, blank=True)
    default_down_payment_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    default_security_deposit_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    default_grace_days = models.PositiveSmallIntegerField(null=True, blank=True)

    is_lucky_plan_eligible = models.BooleanField(default=False, db_index=True)
    requires_batch = models.BooleanField(default=False)
    requires_lucky_id = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="plan_templates_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="plan_templates_updated",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "growth_plan_templates"
        ordering = ["plan_type", "template_code"]
        indexes = [
            models.Index(fields=["is_active", "plan_type"], name="growth_pt_active_type_idx"),
        ]

    def __str__(self):
        return f"PlanTemplate[{self.template_code}] {self.plan_type} active={self.is_active}"

    def clean(self):
        if self.plan_type in (PlanTemplateType.RENT, PlanTemplateType.LEASE):
            if self.requires_lucky_id:
                raise ValidationError(
                    {"requires_lucky_id": "RENT/LEASE templates must not require a Lucky ID."}
                )
        if self.plan_type == PlanTemplateType.EMI:
            if self.default_security_deposit_percent is not None:
                raise ValidationError(
                    {"default_security_deposit_percent": "Security deposit percent applies to RENT/LEASE only."}
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────
# OfferPackage
# ─────────────────────────────────────────────

class OfferPackageStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    PAUSED = "PAUSED", "Paused"
    EXPIRED = "EXPIRED", "Expired"
    ARCHIVED = "ARCHIVED", "Archived"


class OfferAudienceType(models.TextChoices):
    ALL = "ALL", "All Customers"
    NEW_CUSTOMER = "NEW_CUSTOMER", "New Customer"
    EXISTING_CUSTOMER = "EXISTING_CUSTOMER", "Existing Customer"
    PARTNER_REFERRED = "PARTNER_REFERRED", "Partner Referred"
    HIGH_TRUST_CUSTOMER = "HIGH_TRUST_CUSTOMER", "High Trust Customer"


class OfferPackage(GrowthTimeStampedModel):
    """
    A time-bounded offer built on a PlanTemplate.

    Eligibility and preview are advisory only in P5A.
    Does not create subscriptions, EMIs, payments, or accounting records.
    """

    package_code = models.CharField(max_length=60, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")

    plan_template = models.ForeignKey(
        PlanTemplate,
        on_delete=models.PROTECT,
        related_name="offer_packages",
    )

    start_date = models.DateField(null=True, blank=True, db_index=True)
    end_date = models.DateField(null=True, blank=True, db_index=True)

    status = models.CharField(
        max_length=10,
        choices=OfferPackageStatus.choices,
        default=OfferPackageStatus.DRAFT,
        db_index=True,
    )

    audience_type = models.CharField(
        max_length=22,
        choices=OfferAudienceType.choices,
        default=OfferAudienceType.ALL,
        db_index=True,
    )

    max_contract_value = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    min_contract_value = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    display_priority = models.PositiveIntegerField(default=100, db_index=True)
    is_public_visible = models.BooleanField(default=False)
    requires_approval = models.BooleanField(default=False)

    metadata = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="offer_packages_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="offer_packages_updated",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "growth_offer_packages"
        ordering = ["display_priority", "package_code"]
        indexes = [
            models.Index(fields=["status", "audience_type"], name="growth_op_status_audience_idx"),
            models.Index(fields=["start_date", "end_date"], name="growth_op_date_range_idx"),
        ]

    def __str__(self):
        return f"OfferPackage[{self.package_code}] {self.status}"


# ─────────────────────────────────────────────
# OfferPackageLine
# ─────────────────────────────────────────────

class OfferDiscountType(models.TextChoices):
    NONE = "NONE", "No Discount"
    FLAT = "FLAT", "Flat Amount"
    PERCENT = "PERCENT", "Percentage"


class OfferPackageLine(models.Model):
    """
    Optional product-level line within an OfferPackage.

    price_override and discount_value are preview/config only.
    They do NOT mutate Product.base_price.
    """

    offer_package = models.ForeignKey(
        OfferPackage,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "products_core.Product",
        on_delete=models.PROTECT,
        related_name="offer_package_lines",
    )
    quantity = models.PositiveIntegerField(default=1)

    price_override = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    discount_type = models.CharField(
        max_length=8,
        choices=OfferDiscountType.choices,
        default=OfferDiscountType.NONE,
    )
    discount_value = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "growth_offer_package_lines"
        ordering = ["offer_package_id", "product_id"]

    def __str__(self):
        return f"OfferLine[{self.offer_package_id}:{self.product_id}]"


# ─────────────────────────────────────────────
# CustomerGrowthRequest (P5B)
# ─────────────────────────────────────────────

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
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        db_index=True,
    )
    source_subscription = models.ForeignKey(
        "contracts.Subscription",
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
        "growth.PlanTemplate",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        null=True,
        blank=True,
    )
    desired_offer_package = models.ForeignKey(
        "growth.OfferPackage",
        on_delete=models.PROTECT,
        related_name="growth_requests",
        null=True,
        blank=True,
    )
    requested_product = models.ForeignKey(
        "products_core.Product",
        on_delete=models.PROTECT,
        related_name="growth_requests_as_requested",
        null=True,
        blank=True,
    )
    current_product = models.ForeignKey(
        "products_core.Product",
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
        "products_core.Product",
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


# ─────────────────────────────────────────────
# CustomerOfferGrant — per-customer offer entitlement
# ─────────────────────────────────────────────

class CustomerOfferGrantStatus(models.TextChoices):
    PENDING = "PENDING", "Pending approval"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    WITHDRAWN = "WITHDRAWN", "Withdrawn"


class CustomerOfferGrantSource(models.TextChoices):
    """How the customer came to be offered this."""

    INDIVIDUAL = "INDIVIDUAL", "Granted to this customer directly"
    SEGMENT = "SEGMENT", "Granted from an audience segment"


class CustomerOfferGrant(GrowthTimeStampedModel):
    """
    One customer's entitlement to an OfferPackage.

    A grant is what actually moves a price for a customer. Segment membership
    (OfferPackage.audience_type) only makes a customer a *candidate*; a person
    still has to approve the grant before the discount is honoured, so margin is
    never given away automatically.

    Applies on authenticated surfaces only — the customer portal and admin
    quoting. The anonymous public catalogue has no customer and is unaffected.
    """

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="offer_grants",
        db_index=True,
    )
    offer_package = models.ForeignKey(
        OfferPackage,
        on_delete=models.PROTECT,
        related_name="customer_grants",
        db_index=True,
    )

    status = models.CharField(
        max_length=12,
        choices=CustomerOfferGrantStatus.choices,
        default=CustomerOfferGrantStatus.PENDING,
        db_index=True,
    )
    source = models.CharField(
        max_length=12,
        choices=CustomerOfferGrantSource.choices,
        default=CustomerOfferGrantSource.INDIVIDUAL,
        db_index=True,
    )

    # Beyond this date the grant stops applying even if approved. Independent of
    # the package's own start/end window, which is also enforced.
    expires_on = models.DateField(null=True, blank=True, db_index=True)

    note = models.TextField(blank=True, default="")
    decision_note = models.TextField(blank=True, default="")

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="offer_grants_requested",
        null=True,
        blank=True,
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="offer_grants_decided",
        null=True,
        blank=True,
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "growth_customer_offer_grants"
        ordering = ["-created_at"]
        constraints = [
            # One live grant per customer/package. History is kept by moving old
            # grants to REJECTED/WITHDRAWN rather than deleting them.
            models.UniqueConstraint(
                fields=["customer", "offer_package"],
                condition=models.Q(status__in=["PENDING", "APPROVED"]),
                name="uq_live_offer_grant_per_customer_package",
            ),
        ]
        indexes = [
            models.Index(fields=["customer", "status"], name="growth_cog_cust_status_idx"),
            models.Index(fields=["status", "expires_on"], name="growth_cog_status_exp_idx"),
        ]

    def __str__(self):
        return f"CustomerOfferGrant[{self.customer_id}:{self.offer_package_id}] {self.status}"

    def clean(self):
        if self.status in (
            CustomerOfferGrantStatus.APPROVED,
            CustomerOfferGrantStatus.REJECTED,
        ) and not self.decided_by_id:
            raise ValidationError(
                {"decided_by": "A decided grant must record who decided it."}
            )

    def is_live(self, on_date=None) -> bool:
        """Approved, not expired, and its package window is open."""
        on_date = on_date or timezone.localdate()
        if self.status != CustomerOfferGrantStatus.APPROVED:
            return False
        if self.expires_on and on_date > self.expires_on:
            return False
        pkg = self.offer_package
        if pkg.status != OfferPackageStatus.ACTIVE:
            return False
        if pkg.start_date and on_date < pkg.start_date:
            return False
        if pkg.end_date and on_date > pkg.end_date:
            return False
        return True
