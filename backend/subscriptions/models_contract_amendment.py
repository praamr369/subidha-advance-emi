from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from subscriptions.models import Customer, PlanType, Subscription, TimeStampedModel


class ContractAmendmentContractType(models.TextChoices):
    EMI_SUBSCRIPTION = "EMI_SUBSCRIPTION", "EMI Subscription"
    RENT_LEASE = "RENT_LEASE", "Rent / Lease"


class ContractAmendmentRequestedRole(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    PARTNER = "PARTNER", "Partner"


class ContractAmendmentType(models.TextChoices):
    ADDRESS_CHANGE = "ADDRESS_CHANGE", "Address Change"
    CONTACT_CORRECTION = "CONTACT_CORRECTION", "Contact Correction"
    LEGAL_DOCUMENT_CORRECTION = "LEGAL_DOCUMENT_CORRECTION", "Legal Document Correction"
    TENURE_EXTENSION = "TENURE_EXTENSION", "Tenure Extension"
    SCHEDULE_CORRECTION = "SCHEDULE_CORRECTION", "Schedule Correction"
    PRODUCT_CHANGE = "PRODUCT_CHANGE", "Product Change"
    LUCKY_ID_CHANGE = "LUCKY_ID_CHANGE", "Lucky ID Change"
    BATCH_CHANGE = "BATCH_CHANGE", "Batch Change"
    DEPOSIT_ADJUSTMENT = "DEPOSIT_ADJUSTMENT", "Deposit Adjustment"
    EMI_AMOUNT_CHANGE = "EMI_AMOUNT_CHANGE", "EMI Amount Change"
    CONTRACT_PRICE_CHANGE = "CONTRACT_PRICE_CHANGE", "Contract Price Change"
    RENT_AMOUNT_CHANGE = "RENT_AMOUNT_CHANGE", "Rent Amount Change"
    LEASE_TERM_CHANGE = "LEASE_TERM_CHANGE", "Lease Term Change"
    OTHER = "OTHER", "Other"
    # Backward-compatible legacy value from the older admin-only amendment flow.
    PRODUCT_UPGRADE = "PRODUCT_UPGRADE", "Product Upgrade (Legacy)"


class ContractAmendmentStatus(models.TextChoices):
    REQUESTED = "REQUESTED", "Requested"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    IMPLEMENTED = "IMPLEMENTED", "Implemented"
    CANCELLED = "CANCELLED", "Cancelled"
    # Backward-compatible legacy value from the older admin-only amendment flow.
    APPLIED = "APPLIED", "Applied (Legacy)"


class ContractAmendment(TimeStampedModel):
    amendment_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    contract_type = models.CharField(
        max_length=24,
        choices=ContractAmendmentContractType.choices,
        default=ContractAmendmentContractType.EMI_SUBSCRIPTION,
        db_index=True,
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="amendments",
        null=True,
        blank=True,
    )
    rent_lease_contract = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="rent_lease_contract_amendments",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="contract_amendments",
        null=True,
        blank=True,
    )
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_contract_amendments",
        null=True,
        blank=True,
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_contract_amendments",
    )
    requested_role = models.CharField(
        max_length=16,
        choices=ContractAmendmentRequestedRole.choices,
        default=ContractAmendmentRequestedRole.CUSTOMER,
        db_index=True,
    )
    amendment_type = models.CharField(max_length=40, choices=ContractAmendmentType.choices, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=ContractAmendmentStatus.choices,
        default=ContractAmendmentStatus.REQUESTED,
        db_index=True,
    )

    # Legacy fields retained for backward compatibility with the old admin contract endpoint.
    previous_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default="")
    applied_at = models.DateTimeField(null=True, blank=True, db_index=True)

    old_values = models.JSONField(default=dict, blank=True)
    requested_values = models.JSONField(default=dict, blank=True)
    approved_values = models.JSONField(default=dict, blank=True)
    implemented_values = models.JSONField(default=dict, blank=True)
    reason = models.TextField()
    admin_note = models.TextField(blank=True, default="")
    rejection_reason = models.TextField(blank=True, default="")
    financial_impact_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requires_emi_recalculation = models.BooleanField(default=False)
    requires_inventory_review = models.BooleanField(default=False)
    requires_lucky_id_review = models.BooleanField(default=False)
    requires_accounting_review = models.BooleanField(default=False)
    requires_rent_lease_review = models.BooleanField(default=False)
    effective_date = models.DateField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_contract_amendments",
        null=True,
        blank=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    implemented_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="implemented_contract_amendments",
        null=True,
        blank=True,
    )
    implemented_at = models.DateTimeField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "contract_amendments"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"], name="contract_am_subscri_b9ee13_idx"),
            models.Index(fields=["amendment_type", "status"], name="contract_am_amendme_c02dce_idx"),
            models.Index(fields=["contract_type", "status"], name="contract_am_type_status_idx"),
            models.Index(fields=["customer", "status"], name="contract_am_customer_status_idx"),
            models.Index(fields=["partner", "status"], name="contract_am_partner_status_idx"),
        ]

    def source_contract(self):
        return self.subscription or self.rent_lease_contract

    def clean(self):
        errors = {}
        has_subscription = bool(self.subscription_id)
        has_rent_lease = bool(self.rent_lease_contract_id)

        if has_subscription == has_rent_lease:
            errors["source"] = "Exactly one contract source is required: subscription or rent_lease_contract."

        if self.contract_type not in ContractAmendmentContractType.values:
            errors["contract_type"] = "Unsupported contract type. Direct Sale amendments are not supported."

        if has_subscription:
            if self.contract_type != ContractAmendmentContractType.EMI_SUBSCRIPTION:
                errors["contract_type"] = "EMI subscription amendments must use contract_type EMI_SUBSCRIPTION."
            elif self.subscription.plan_type != PlanType.EMI:
                errors["subscription"] = "subscription must point to an EMI subscription."

        if has_rent_lease:
            if self.contract_type != ContractAmendmentContractType.RENT_LEASE:
                errors["contract_type"] = "Rent/lease amendments must use contract_type RENT_LEASE."
            elif self.rent_lease_contract.plan_type not in {PlanType.RENT, PlanType.LEASE}:
                errors["rent_lease_contract"] = "rent_lease_contract must point to a RENT or LEASE subscription."

        source = self.source_contract()
        if source and self.customer_id and source.customer_id != self.customer_id:
            errors["customer"] = "Customer must match the source contract."
        if source and self.partner_id and source.partner_id != self.partner_id:
            errors["partner"] = "Partner must match the source contract partner."

        if self.status == ContractAmendmentStatus.REJECTED and not (self.rejection_reason or "").strip():
            errors["rejection_reason"] = "Rejection reason is required when rejecting an amendment."

        if self.financial_impact_amount is not None and self.financial_impact_amount < Decimal("0.00"):
            errors["financial_impact_amount"] = "Financial impact amount cannot be negative."

        if self.requested_role not in ContractAmendmentRequestedRole.values:
            errors["requested_role"] = "Requested role must be CUSTOMER or PARTNER."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self.amendment_no:
            self.amendment_no = f"AMD-{timezone.now():%Y%m%d}-{uuid4().hex[:8].upper()}"
        self.reason = (self.reason or "").strip()
        self.admin_note = (self.admin_note or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.notes = (self.notes or "").strip()
        if not self.old_values and self.previous_values:
            self.old_values = self.previous_values
        if not self.requested_values and self.new_values:
            self.requested_values = self.new_values
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.amendment_no or f"ContractAmendment #{self.pk}"
