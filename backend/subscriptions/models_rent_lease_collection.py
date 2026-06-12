from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import (
    Customer,
    MONEY_ZERO,
    PaymentMethod,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    Subscription,
    TimeStampedModel,
    q2,
)


def generate_rent_lease_collection_number() -> str:
    return f"RLC-{timezone.now():%Y%m%d%H%M%S%f}-{uuid4().hex[:8].upper()}"


class RentLeaseCollectionStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    VOIDED = "VOIDED", "Voided"
    REVERSED = "REVERSED", "Reversed"


class RentLeaseCollection(TimeStampedModel):
    collection_number = models.CharField(max_length=64, unique=True, db_index=True, default=generate_rent_lease_collection_number)
    external_reference_no = models.CharField(max_length=120, blank=True, default="", db_index=True)
    demand = models.ForeignKey(RentLeaseBillingDemand, on_delete=models.PROTECT, related_name="rent_lease_collections")
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="rent_lease_collections")
    contract_reference = models.ForeignKey("subscriptions.ContractReference", on_delete=models.PROTECT, related_name="rent_lease_collections", null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="rent_lease_collections")
    plan_type = models.CharField(max_length=10, choices=PlanType.choices, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField(db_index=True)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    finance_account = models.ForeignKey("accounting.FinanceAccount", on_delete=models.PROTECT, related_name="rent_lease_collections")
    status = models.CharField(max_length=16, choices=RentLeaseCollectionStatus.choices, default=RentLeaseCollectionStatus.ACTIVE, db_index=True)
    idempotency_key = models.CharField(max_length=160, blank=True, default="", db_index=True)
    note = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_rent_lease_collections", null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="voided_rent_lease_collections", null=True, blank=True)
    void_reason = models.TextField(blank=True, default="")
    reversal_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    IMMUTABLE_FIELDS = (
        "collection_number",
        "external_reference_no",
        "demand_id",
        "subscription_id",
        "contract_reference_id",
        "customer_id",
        "plan_type",
        "amount",
        "payment_date",
        "payment_method",
        "finance_account_id",
        "idempotency_key",
        "created_by_id",
    )

    class Meta:
        db_table = "rent_lease_collections"
        ordering = ["-payment_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "payment_date"]),
            models.Index(fields=["demand", "status"]),
            models.Index(fields=["customer", "payment_date"]),
            models.Index(fields=["plan_type", "status", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=MONEY_ZERO), name="chk_rent_lease_collection_amount_positive"),
            models.CheckConstraint(condition=Q(plan_type=PlanType.RENT) | Q(plan_type=PlanType.LEASE), name="chk_rent_lease_collection_plan_type"),
            models.UniqueConstraint(fields=["idempotency_key"], condition=~Q(idempotency_key=""), name="uq_rent_lease_collection_idempotency_key"),
            models.UniqueConstraint(fields=["external_reference_no"], condition=~Q(external_reference_no=""), name="uq_rent_lease_collection_external_ref"),
        ]

    def clean(self):
        errors = {}
        amount = q2(Decimal(str(self.amount or MONEY_ZERO)))
        if amount <= MONEY_ZERO:
            errors["amount"] = "Amount must be greater than zero."
        if self.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["plan_type"] = "Plan type must be RENT or LEASE."
        if self.subscription_id:
            if self.subscription.plan_type != self.plan_type:
                errors["subscription"] = "Subscription plan type mismatch."
            if self.customer_id and self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer mismatch."
        if self.demand_id:
            if self.subscription_id and self.demand.subscription_id != self.subscription_id:
                errors["demand"] = "Demand subscription mismatch."
            if self.demand.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
                errors["demand"] = "Deposit demand is not monthly rent/lease collection evidence."
            expected = RentLeaseDemandType.RENT_MONTHLY if self.plan_type == PlanType.RENT else RentLeaseDemandType.LEASE_MONTHLY
            if self.plan_type in {PlanType.RENT, PlanType.LEASE} and self.demand.demand_type != expected:
                errors["demand_type"] = "Demand type mismatch."
        if self.contract_reference_id and self.subscription_id and self.contract_reference.subscription_id != self.subscription_id:
            errors["contract_reference"] = "Contract reference mismatch."
        if self.pk:
            existing = self.__class__.objects.filter(pk=self.pk).first()
            if existing:
                for field in self.IMMUTABLE_FIELDS:
                    old_value = getattr(existing, field)
                    new_value = getattr(self, field)
                    if field == "amount":
                        old_value = q2(Decimal(str(old_value or MONEY_ZERO)))
                        new_value = q2(Decimal(str(new_value or MONEY_ZERO)))
                    if old_value != new_value:
                        errors[field.removesuffix("_id")] = "Source evidence is immutable once created."
        if self.status in {RentLeaseCollectionStatus.VOIDED, RentLeaseCollectionStatus.REVERSED}:
            if not self.voided_at:
                errors["voided_at"] = "Timestamp is required."
            if not (self.void_reason or "").strip():
                errors["void_reason"] = "Reason is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.collection_number = (self.collection_number or generate_rent_lease_collection_number()).strip().upper()
        self.external_reference_no = (self.external_reference_no or "").strip().upper()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.payment_method = (self.payment_method or PaymentMethod.CASH).strip().upper()
        self.plan_type = (self.plan_type or "").strip().upper()
        self.status = (self.status or RentLeaseCollectionStatus.ACTIVE).strip().upper()
        self.note = (self.note or "").strip()
        self.void_reason = (self.void_reason or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip().upper()
        if not self.payment_date:
            self.payment_date = timezone.localdate()
        self.amount = q2(Decimal(str(self.amount or MONEY_ZERO)))
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.collection_number
