"""
P5A — Growth Foundation: PlanTemplate, OfferPackage, OfferPackageLine.

Additive. No existing model, service, or migration touched.
No subscription creation, EMI recalculation, or financial record mutation.
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
        "subscriptions.Product",
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
