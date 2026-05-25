from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from subscriptions.models import ContractAmendment, PlanType, Subscription


CONTRACT_AMENDMENT_CONTRACT_TYPE_CHOICES = [
    ("EMI_SUBSCRIPTION", "EMI Subscription"),
    ("RENT_LEASE", "Rent / Lease"),
]

CONTRACT_AMENDMENT_REQUESTED_ROLE_CHOICES = [
    ("CUSTOMER", "Customer"),
    ("PARTNER", "Partner"),
]

CONTRACT_AMENDMENT_TYPE_CHOICES = [
    ("ADDRESS_CHANGE", "Address Change"),
    ("CONTACT_CORRECTION", "Contact Correction"),
    ("LEGAL_DOCUMENT_CORRECTION", "Legal Document Correction"),
    ("TENURE_EXTENSION", "Tenure Extension"),
    ("SCHEDULE_CORRECTION", "Schedule Correction"),
    ("PRODUCT_CHANGE", "Product Change"),
    ("LUCKY_ID_CHANGE", "Lucky ID Change"),
    ("BATCH_CHANGE", "Batch Change"),
    ("DEPOSIT_ADJUSTMENT", "Deposit Adjustment"),
    ("EMI_AMOUNT_CHANGE", "EMI Amount Change"),
    ("CONTRACT_PRICE_CHANGE", "Contract Price Change"),
    ("RENT_AMOUNT_CHANGE", "Rent Amount Change"),
    ("LEASE_TERM_CHANGE", "Lease Term Change"),
    ("OTHER", "Other"),
    ("PRODUCT_UPGRADE", "Product Upgrade (Legacy)"),
]

CONTRACT_AMENDMENT_STATUS_CHOICES = [
    ("REQUESTED", "Requested"),
    ("UNDER_REVIEW", "Under Review"),
    ("APPROVED", "Approved"),
    ("REJECTED", "Rejected"),
    ("IMPLEMENTED", "Implemented"),
    ("CANCELLED", "Cancelled"),
    ("APPLIED", "Applied (Legacy)"),
]

PHASE1_AMENDMENT_TYPES = {value for value, _label in CONTRACT_AMENDMENT_TYPE_CHOICES}
PHASE1_STATUSES = {value for value, _label in CONTRACT_AMENDMENT_STATUS_CHOICES}


def _has_field(model, field_name: str) -> bool:
    try:
        model._meta.get_field(field_name)
        return True
    except Exception:
        return False


def _contribute(field_name: str, field: models.Field) -> None:
    if not _has_field(ContractAmendment, field_name):
        field.contribute_to_class(ContractAmendment, field_name)


def _extend_contract_amendment_model() -> None:
    # Keep the legacy model class and table; add Phase 1 fields additively.
    subscription_field = ContractAmendment._meta.get_field("subscription")
    subscription_field.null = True
    subscription_field.blank = True

    ContractAmendment._meta.get_field("amendment_type").choices = CONTRACT_AMENDMENT_TYPE_CHOICES
    ContractAmendment._meta.get_field("status").choices = CONTRACT_AMENDMENT_STATUS_CHOICES
    ContractAmendment._meta.get_field("previous_values").blank = True
    ContractAmendment._meta.get_field("new_values").blank = True

    _contribute("amendment_no", models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True))
    _contribute("contract_type", models.CharField(max_length=24, choices=CONTRACT_AMENDMENT_CONTRACT_TYPE_CHOICES, default="EMI_SUBSCRIPTION", db_index=True))
    _contribute("rent_lease_contract", models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="rent_lease_contract_amendments", null=True, blank=True))
    _contribute("customer", models.ForeignKey("subscriptions.Customer", on_delete=models.PROTECT, related_name="contract_amendments", null=True, blank=True))
    _contribute("partner", models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="partner_contract_amendments", null=True, blank=True))
    _contribute("requested_role", models.CharField(max_length=16, choices=CONTRACT_AMENDMENT_REQUESTED_ROLE_CHOICES, default="CUSTOMER", db_index=True))
    _contribute("old_values", models.JSONField(default=dict, blank=True))
    _contribute("requested_values", models.JSONField(default=dict, blank=True))
    _contribute("approved_values", models.JSONField(default=dict, blank=True))
    _contribute("implemented_values", models.JSONField(default=dict, blank=True))
    _contribute("admin_note", models.TextField(blank=True, default=""))
    _contribute("financial_impact_amount", models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True))
    _contribute("requires_emi_recalculation", models.BooleanField(default=False))
    _contribute("requires_inventory_review", models.BooleanField(default=False))
    _contribute("requires_lucky_id_review", models.BooleanField(default=False))
    _contribute("requires_accounting_review", models.BooleanField(default=False))
    _contribute("requires_rent_lease_review", models.BooleanField(default=False))
    _contribute("effective_date", models.DateField(null=True, blank=True))
    _contribute("implemented_by", models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="implemented_contract_amendments", null=True, blank=True))
    _contribute("implemented_at", models.DateTimeField(null=True, blank=True, db_index=True))
    _contribute("metadata", models.JSONField(default=dict, blank=True))
    _contribute("updated_at", models.DateTimeField(auto_now=True, db_index=True, null=True, blank=True))


def source_contract(self):
    return self.subscription or self.rent_lease_contract


def clean(self):
    errors = {}
    has_subscription = bool(self.subscription_id)
    has_rent_lease = bool(getattr(self, "rent_lease_contract_id", None))

    if has_subscription == has_rent_lease:
        errors["source"] = "Exactly one contract source is required: subscription or rent_lease_contract."

    if self.contract_type not in {"EMI_SUBSCRIPTION", "RENT_LEASE"}:
        errors["contract_type"] = "Unsupported contract type. Direct Sale amendments are not supported."

    if has_subscription:
        if self.contract_type != "EMI_SUBSCRIPTION":
            errors["contract_type"] = "EMI subscription amendments must use contract_type EMI_SUBSCRIPTION."
        elif self.subscription.plan_type != PlanType.EMI:
            errors["subscription"] = "subscription must point to an EMI subscription."

    if has_rent_lease:
        if self.contract_type != "RENT_LEASE":
            errors["contract_type"] = "Rent/lease amendments must use contract_type RENT_LEASE."
        elif self.rent_lease_contract.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["rent_lease_contract"] = "rent_lease_contract must point to a RENT or LEASE subscription."

    source = self.source_contract()
    if source and self.customer_id and source.customer_id != self.customer_id:
        errors["customer"] = "Customer must match the source contract."
    if source and self.partner_id and source.partner_id != self.partner_id:
        errors["partner"] = "Partner must match the source contract partner."

    if self.status == "REJECTED" and not (self.rejection_reason or "").strip():
        errors["rejection_reason"] = "Rejection reason is required when rejecting an amendment."

    if self.financial_impact_amount is not None and self.financial_impact_amount < Decimal("0.00"):
        errors["financial_impact_amount"] = "Financial impact amount cannot be negative."

    if self.requested_role not in {"CUSTOMER", "PARTNER"}:
        errors["requested_role"] = "Requested role must be CUSTOMER or PARTNER."

    if self.amendment_type not in PHASE1_AMENDMENT_TYPES:
        errors["amendment_type"] = "Unsupported amendment type."

    if errors:
        raise ValidationError(errors)


def save(self, *args, **kwargs):
    if not self.amendment_no:
        self.amendment_no = f"AMD-{timezone.now():%Y%m%d}-{uuid4().hex[:8].upper()}"
    self.reason = (self.reason or "").strip()
    self.admin_note = (getattr(self, "admin_note", "") or "").strip()
    self.rejection_reason = (self.rejection_reason or "").strip()
    self.notes = (self.notes or "").strip()
    if not self.old_values and self.previous_values:
        self.old_values = self.previous_values
    if not self.requested_values and self.new_values:
        self.requested_values = self.new_values
    self.full_clean()
    super(ContractAmendment, self).save(*args, **kwargs)


_extend_contract_amendment_model()
ContractAmendment.source_contract = source_contract
ContractAmendment.clean = clean
ContractAmendment.save = save
