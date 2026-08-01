from django.db import models, transaction
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.utils import timezone
from django.db.models import Q, F, Sum, Count, Avg, Min, Max
from decimal import Decimal
from django.conf import settings
from subscriptions.enums import *
from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, HUNDRED, q2, _default_branch,
    product_image_upload_to, subscription_document_upload_to,
    customer_photo_upload_to, customer_kyc_doc_upload_to,
    
)

class Subscription(TimeStampedModel):
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )
    product = models.ForeignKey('products_core.Product',
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_subscriptions",
    )
    batch = models.ForeignKey('lucky_plan.Batch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    lucky_id = models.ForeignKey('lucky_plan.LuckyId',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    plan_type = models.CharField(max_length=10, choices=PlanType.choices, db_index=True)
    tenure_months = models.PositiveIntegerField()
    start_date = models.DateField()
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    monthly_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.ACTIVE,
        db_index=True,
    )
    winner_month = models.PositiveIntegerField(null=True, blank=True)
    waived_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )
    contract_reference = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    fulfillment_status = models.CharField(
        max_length=20,
        choices=FulfillmentStatus.choices,
        default=FulfillmentStatus.PENDING,
        db_index=True,
    )
    product_snapshot = models.JSONField(null=True, blank=True)
    pricing_snapshot = models.JSONField(null=True, blank=True)
    tax_profile_snapshot = models.JSONField(null=True, blank=True)
    # Phase 3: immutable contract number (ADV-EMI / RENT / LEASE prefix + year + seq)
    subscription_number = models.CharField(
        max_length=40, unique=True, null=True, blank=True, db_index=True
    )
    # Phase 3: financial term lock
    terms_locked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    terms_locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="locked_subscription_terms",
    )
    # Phase 3: cancellation tracking
    cancellation_reason = models.TextField(blank=True, default="")
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_subscriptions",
    )
    # Advance EMI: prepayment + early delivery unlock
    advance_delivery_unlocked = models.BooleanField(default=False, db_index=True)
    prepayment_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    prepayment_date = models.DateTimeField(null=True, blank=True)
    # CTRL-RENT-3 — SHA-256 hash of the signed rental/lease agreement PDF.
    # Set once when contract PDF is sealed; immutable thereafter.
    agreement_pdf_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="SHA-256 hex digest of the signed contract PDF (CTRL-RENT-3).",
    )
    agreement_pdf_sealed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the agreement PDF hash was committed.",
    )

    class Meta:
        db_table = "subscriptions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["batch"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["plan_type"]),
            models.Index(fields=["partner"]),
            models.Index(fields=["start_date"]),
            models.Index(fields=["branch", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(
                        plan_type=PlanType.EMI,
                        status=SubscriptionStatus.CANCELLED,
                        batch__isnull=False,
                    )
                    | Q(
                        plan_type=PlanType.EMI,
                        batch__isnull=False,
                        lucky_id__isnull=False,
                    )
                    & ~Q(status=SubscriptionStatus.CANCELLED)
                    | ~Q(plan_type=PlanType.EMI)
                ),
                name="chk_batch_and_lucky_required_for_emi",
            ),
            models.UniqueConstraint(
                fields=["lucky_id"],
                condition=Q(plan_type=PlanType.EMI),
                name="uq_subscription_per_lucky_id",
            ),
            models.CheckConstraint(
                condition=Q(total_amount__gt=0),
                name="chk_subscription_total_positive",
            ),
            models.CheckConstraint(
                condition=Q(monthly_amount__gt=0),
                name="chk_subscription_monthly_positive",
            ),
            models.CheckConstraint(
                condition=Q(tenure_months__gt=0),
                name="chk_subscription_tenure_positive",
            ),
            models.CheckConstraint(
                condition=Q(waived_amount__gte=0),
                name="chk_subscription_waived_non_negative",
            ),
        ]

    def clean(self):
        if self.total_amount is None or self.total_amount <= MONEY_ZERO:
            raise ValidationError({"total_amount": "Total amount must be greater than zero."})

        if self.monthly_amount is None or self.monthly_amount <= MONEY_ZERO:
            raise ValidationError({"monthly_amount": "Monthly amount must be greater than zero."})

        if self.tenure_months <= 0:
            raise ValidationError({"tenure_months": "Tenure must be greater than zero."})

        if self.waived_amount is not None and self.waived_amount < MONEY_ZERO:
            raise ValidationError({"waived_amount": "Waived amount cannot be negative."})

        if self.plan_type == PlanType.EMI:
            if not self.batch:
                raise ValidationError({"batch": "EMI subscription requires a batch."})

            if not self.lucky_id:
                if self.status != SubscriptionStatus.CANCELLED:
                    raise ValidationError({"lucky_id": "EMI subscription requires a lucky ID."})
                return

            if self.lucky_id.batch_id != self.batch_id:
                raise ValidationError({"lucky_id": "Lucky ID must belong to the selected batch."})

            if self.tenure_months != self.batch.duration_months:
                raise ValidationError({"tenure_months": "Tenure must match batch duration."})

            lucky_id_changed = False
            if self.pk:
                old = Subscription.objects.filter(pk=self.pk).only("lucky_id_id").first()
                lucky_id_changed = bool(old and old.lucky_id_id != self.lucky_id_id)

            if (not self.pk or lucky_id_changed) and self.lucky_id.status != LuckyIdStatus.AVAILABLE:
                raise ValidationError({"lucky_id": "Selected Lucky ID is not available."})

            # CTRL-LP-5 — once the batch is LOCKED or beyond, no new subscriptions
            # may be enrolled; the eligible-pool snapshot is frozen at lock time.
            if not self.pk and self.batch_id:
                locked_statuses = {BatchStatus.LOCKED, BatchStatus.COMPLETED, BatchStatus.CLOSED}
                batch_status = self.batch.status if hasattr(self, '_batch_cache') else (
                    Batch.objects.filter(pk=self.batch_id).values_list("status", flat=True).first()
                )
                if batch_status in locked_statuses:
                    raise ValidationError(
                        {"batch": f"Batch is {batch_status} — new subscriptions cannot be enrolled after the eligible-pool snapshot is frozen (CTRL-LP-5)."}
                    )

        else:
            if self.batch_id or self.lucky_id_id:
                raise ValidationError(
                    {"batch": "Only EMI subscriptions can have batch/lucky ID mapping."}
                )

        if self.winner_month is not None and self.winner_month <= 0:
            raise ValidationError({"winner_month": "Winner month must be positive."})

    def save(self, *args, **kwargs):
        if not self.product_snapshot and self.product_id:
            self.product_snapshot = {
                "product_id": self.product_id,
                "product_code": self.product.product_code,
                "name": self.product.name,
                "base_price": str(self.product.base_price),
                "category": self.product.category,
                "subcategory": self.product.subcategory,
                "description": self.product.description,
                "is_active": self.product.is_active,
                "plan_type_default": self.product.plan_type_default,
                "is_emi_enabled": self.product.is_emi_enabled,
                "is_rent_enabled": self.product.is_rent_enabled,
                "is_lease_enabled": self.product.is_lease_enabled,
            }

        if not self.pricing_snapshot:
            self.pricing_snapshot = {
                "plan_type": self.plan_type,
                "tenure_months": self.tenure_months,
                "monthly_amount": str(self.monthly_amount),
                "total_amount": str(self.total_amount),
            }

        if self.branch_id is None:
            self.branch = _default_branch()

        # CTRL-RENT-3 — once agreement_pdf_hash is set it is immutable.
        if self.pk and self.agreement_pdf_hash:
            existing_hash = (
                Subscription.objects.filter(pk=self.pk)
                .values_list("agreement_pdf_hash", flat=True)
                .first()
            )
            if existing_hash and existing_hash != self.agreement_pdf_hash:
                raise ValidationError(
                    {"agreement_pdf_hash": "Agreement PDF hash is immutable once committed."}
                )

        self.full_clean()

        previous_lucky_id_id = None
        if self.pk:
            old = Subscription.objects.filter(pk=self.pk).only("lucky_id_id").first()
            previous_lucky_id_id = old.lucky_id_id if old else None

        with transaction.atomic():
            super().save(*args, **kwargs)

            if self.plan_type == PlanType.EMI and self.lucky_id_id:
                has_winner_history = (
                    self.status == SubscriptionStatus.WON
                    or self.winner_month is not None
                )
                LuckyId.objects.filter(pk=self.lucky_id_id).update(
                    status=LuckyIdStatus.WON if has_winner_history else LuckyIdStatus.ASSIGNED
                )

            if previous_lucky_id_id and previous_lucky_id_id != self.lucky_id_id:
                still_used = Subscription.objects.filter(
                    lucky_id_id=previous_lucky_id_id
                ).exclude(pk=self.pk).exists()
                if not still_used:
                    LuckyId.objects.filter(pk=previous_lucky_id_id).update(
                        status=LuckyIdStatus.AVAILABLE
                    )

    def net_paid_amount(self) -> Decimal:
        effective_paid = (
            FinancialLedger.objects.filter(
                emi__subscription=self,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        reversal_total = (
            FinancialLedger.objects.filter(
                emi__subscription=self,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        net_paid = q2(Decimal(str(effective_paid)) - Decimal(str(reversal_total)))
        return q2(max(net_paid, MONEY_ZERO))

    def total_paid(self) -> Decimal:
        return self.net_paid_amount()

    def total_pending_emi_amount(self) -> Decimal:
        return q2(
            self.emis.filter(status=EmiStatus.PENDING).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def total_paid_emi_amount(self) -> Decimal:
        return q2(
            self.emis.filter(status=EmiStatus.PAID).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def total_waived_emi_amount(self) -> Decimal:
        return q2(
            self.emis.filter(status=EmiStatus.WAIVED).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def remaining_contract_amount(self) -> Decimal:
        remaining = q2(self.total_amount) - q2(self.total_paid()) - q2(self.waived_amount)
        return q2(max(remaining, MONEY_ZERO))

    def is_fully_settled(self) -> bool:
        return self.remaining_contract_amount() <= MONEY_ZERO

    def recompute_waived_amount_from_emis(self, save: bool = False) -> Decimal:
        waived_total = self.total_waived_emi_amount()
        self.waived_amount = waived_total
        if save:
            self.save(update_fields=["waived_amount"])
        return waived_total

    def __str__(self):
        return f"Subscription #{self.pk} - {self.customer.name}"


# =====================================================
# CONTRACTS (RENT / LEASE)
# =====================================================


class RentSubscriptionProfile(TimeStampedModel):
    subscription = models.OneToOneField(
        Subscription,
        on_delete=models.CASCADE,
        related_name="rent_profile",
    )
    security_deposit_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[
            MinValueValidator(Decimal("20.00")),
            MaxValueValidator(Decimal("30.00")),
        ],
    )
    security_deposit_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    refundable_security_deposit = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    return_condition_status = models.CharField(
        max_length=30,
        choices=ContractReturnConditionStatus.choices,
        default=ContractReturnConditionStatus.NOT_ASSESSED,
        db_index=True,
    )
    deduction_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    refund_status = models.CharField(
        max_length=20,
        choices=ContractRefundStatus.choices,
        default=ContractRefundStatus.PENDING,
        db_index=True,
    )
    return_inspection_notes = models.TextField(blank=True, default="")
    handover_notes = models.TextField(blank=True, default="")
    contract_terms_snapshot = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "rent_subscription_profiles"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["refund_status"]),
            models.Index(fields=["return_condition_status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(security_deposit_percent__gte=Decimal("20.00"))
                & Q(security_deposit_percent__lte=Decimal("30.00")),
                name="chk_rent_security_deposit_percent_range",
            ),
            models.CheckConstraint(
                condition=Q(security_deposit_amount__gte=MONEY_ZERO),
                name="chk_rent_security_deposit_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(deduction_amount__gte=MONEY_ZERO),
                name="chk_rent_deduction_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(refund_amount__gte=MONEY_ZERO),
                name="chk_rent_refund_amount_non_negative",
            ),
        ]

    def clean(self):
        errors = {}

        if self.subscription_id and self.subscription.plan_type != PlanType.RENT:
            errors["subscription"] = "Rent profile can only be attached to RENT subscriptions."

        if self.security_deposit_percent is None:
            errors["security_deposit_percent"] = "Security deposit percent is required."
        else:
            if (
                self.security_deposit_percent < Decimal("20.00")
                or self.security_deposit_percent > Decimal("30.00")
            ):
                errors["security_deposit_percent"] = "Security deposit percent must be between 20 and 30."

        if self.deduction_amount is not None and self.deduction_amount < MONEY_ZERO:
            errors["deduction_amount"] = "Deduction amount cannot be negative."

        if self.refund_amount is not None and self.refund_amount < MONEY_ZERO:
            errors["refund_amount"] = "Refund amount cannot be negative."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.return_inspection_notes = (self.return_inspection_notes or "").strip()
        self.handover_notes = (self.handover_notes or "").strip()
        self.contract_terms_snapshot = (self.contract_terms_snapshot or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"RentProfile #{self.pk} for SUB-{self.subscription_id}"



class LeaseSubscriptionProfile(TimeStampedModel):
    subscription = models.OneToOneField(
        Subscription,
        on_delete=models.CASCADE,
        related_name="lease_profile",
    )
    security_deposit_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[
            MinValueValidator(Decimal("20.00")),
            MaxValueValidator(Decimal("30.00")),
        ],
    )
    security_deposit_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    refundable_security_deposit = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    buyout_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    ownership_transfer_allowed = models.BooleanField(default=False)
    return_condition_status = models.CharField(
        max_length=30,
        choices=ContractReturnConditionStatus.choices,
        default=ContractReturnConditionStatus.NOT_ASSESSED,
        db_index=True,
    )
    deduction_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO
    )
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    refund_status = models.CharField(
        max_length=20,
        choices=ContractRefundStatus.choices,
        default=ContractRefundStatus.PENDING,
        db_index=True,
    )
    return_inspection_notes = models.TextField(blank=True, default="")
    handover_notes = models.TextField(blank=True, default="")
    contract_terms_snapshot = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "lease_subscription_profiles"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["refund_status"]),
            models.Index(fields=["return_condition_status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(security_deposit_percent__gte=Decimal("20.00"))
                & Q(security_deposit_percent__lte=Decimal("30.00")),
                name="chk_lease_security_deposit_percent_range",
            ),
            models.CheckConstraint(
                condition=Q(security_deposit_amount__gte=MONEY_ZERO),
                name="chk_lease_security_deposit_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(deduction_amount__gte=MONEY_ZERO),
                name="chk_lease_deduction_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(refund_amount__gte=MONEY_ZERO),
                name="chk_lease_refund_amount_non_negative",
            ),
        ]

    def clean(self):
        errors = {}

        if self.subscription_id and self.subscription.plan_type != PlanType.LEASE:
            errors["subscription"] = "Lease profile can only be attached to LEASE subscriptions."

        if self.security_deposit_percent is None:
            errors["security_deposit_percent"] = "Security deposit percent is required."
        else:
            if (
                self.security_deposit_percent < Decimal("20.00")
                or self.security_deposit_percent > Decimal("30.00")
            ):
                errors["security_deposit_percent"] = "Security deposit percent must be between 20 and 30."

        if self.buyout_amount is not None and self.buyout_amount < MONEY_ZERO:
            errors["buyout_amount"] = "Buyout amount cannot be negative."

        if self.deduction_amount is not None and self.deduction_amount < MONEY_ZERO:
            errors["deduction_amount"] = "Deduction amount cannot be negative."

        if self.refund_amount is not None and self.refund_amount < MONEY_ZERO:
            errors["refund_amount"] = "Refund amount cannot be negative."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.return_inspection_notes = (self.return_inspection_notes or "").strip()
        self.handover_notes = (self.handover_notes or "").strip()
        self.contract_terms_snapshot = (self.contract_terms_snapshot or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"LeaseProfile #{self.pk} for SUB-{self.subscription_id}"



class ContractReferenceSequence(TimeStampedModel):
    scope_key = models.CharField(max_length=120, unique=True, db_index=True)
    next_number = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "contract_reference_sequences"
        ordering = ["scope_key"]

    def clean(self):
        if not self.scope_key or not self.scope_key.strip():
            raise ValidationError({"scope_key": "Sequence scope key is required."})

    def save(self, *args, **kwargs):
        self.scope_key = (self.scope_key or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.scope_key



class ContractReference(TimeStampedModel):
    reference_no = models.CharField(max_length=140, unique=True, db_index=True)
    display_reference = models.CharField(max_length=180, db_index=True)
    contract_type = models.CharField(
        max_length=20,
        choices=ContractReferenceType.choices,
        db_index=True,
    )
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    rent_contract = models.ForeignKey(
        RentSubscriptionProfile,
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    lease_contract = models.ForeignKey(
        LeaseSubscriptionProfile,
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    direct_sale = models.ForeignKey(
        "billing.DirectSale",
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    invoice = models.ForeignKey(
        "billing.BillingInvoice",
        on_delete=models.PROTECT,
        related_name="contract_references",
        null=True,
        blank=True,
    )
    phone_snapshot = models.CharField(max_length=24, blank=True, default="", db_index=True)
    customer_name_snapshot = models.CharField(
        max_length=180,
        blank=True,
        default="",
        db_index=True,
    )
    kyc_reference_snapshot = models.CharField(
        max_length=120,
        null=True,
        blank=True,
        db_index=True,
        help_text="Masked-safe KYC/customer reference snapshot only; never store raw KYC document values here.",
    )
    product_summary_snapshot = models.CharField(max_length=255, blank=True, default="")
    batch_snapshot = models.CharField(max_length=80, blank=True, default="", db_index=True)
    lucky_id_snapshot = models.CharField(max_length=40, blank=True, default="", db_index=True)
    partner_snapshot = models.CharField(max_length=180, blank=True, default="")
    source_created_at = models.DateTimeField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "contract_references"
        ordering = ["-source_created_at", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["contract_type"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["phone_snapshot"]),
            models.Index(fields=["customer_name_snapshot"]),
            models.Index(fields=["kyc_reference_snapshot"]),
            models.Index(fields=["batch_snapshot"]),
            models.Index(fields=["lucky_id_snapshot"]),
            models.Index(fields=["source_created_at"]),
        ]

    def clean(self):
        errors = {}
        if not self.reference_no or not self.reference_no.strip():
            errors["reference_no"] = "Contract reference number is required."
        if not self.display_reference or not self.display_reference.strip():
            errors["display_reference"] = "Display reference is required."
        if self.contract_type not in ContractReferenceType.values:
            errors["contract_type"] = "Unsupported contract reference type."
        if not any(
            [
                self.subscription_id,
                self.rent_contract_id,
                self.lease_contract_id,
                self.direct_sale_id,
                self.invoice_id,
            ]
        ):
            errors["source"] = "ContractReference must point to at least one source record."
        if self.pk:
            existing = ContractReference.objects.only("reference_no").filter(pk=self.pk).first()
            if existing and existing.reference_no != (self.reference_no or "").strip().upper():
                errors["reference_no"] = "Contract reference number is immutable."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip().upper()
        self.display_reference = (self.display_reference or "").strip().upper()
        self.phone_snapshot = (self.phone_snapshot or "").strip()
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.kyc_reference_snapshot = (
            (self.kyc_reference_snapshot or "").strip() or None
        )
        self.product_summary_snapshot = (self.product_summary_snapshot or "").strip()
        self.batch_snapshot = (self.batch_snapshot or "").strip().upper()
        self.lucky_id_snapshot = (self.lucky_id_snapshot or "").strip().upper()
        self.partner_snapshot = (self.partner_snapshot or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference_no



class SubscriptionDocument(TimeStampedModel):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(
        max_length=40,
        choices=SubscriptionDocumentType.choices,
        db_index=True,
    )
    file = models.FileField(upload_to=subscription_document_upload_to)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="uploaded_subscription_documents",
    )
    verification_status = models.CharField(
        max_length=20,
        choices=DocumentVerificationStatus.choices,
        default=DocumentVerificationStatus.PENDING,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    # Phase 3: document versioning
    document_version = models.PositiveIntegerField(default=1)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="generated_subscription_documents",
    )
    regeneration_reason = models.TextField(blank=True, default="")
    # P3A: Document Vault extensions — additive, all have safe defaults for existing rows.
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    expires_on = models.DateField(null=True, blank=True)
    signed_status = models.CharField(
        max_length=20,
        choices=DocumentSignedStatus.choices,
        default=DocumentSignedStatus.UNKNOWN,
    )
    access_level = models.CharField(
        max_length=20,
        choices=DocumentAccessLevel.choices,
        default=DocumentAccessLevel.INTERNAL,
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verified_subscription_documents",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "subscription_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "document_type"]),
            models.Index(fields=["verification_status", "created_at"]),
        ]

    def clean(self):
        errors = {}
        if not self.subscription_id:
            errors["subscription"] = "Subscription is required."
        if not self.document_type:
            errors["document_type"] = "Document type is required."
        if not self.file:
            errors["file"] = "File is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.document_type} for SUB-{self.subscription_id}"



class DocumentAccessLog(TimeStampedModel):
    """Append-only audit log for document access events (P3A)."""

    document = models.ForeignKey(
        SubscriptionDocument,
        on_delete=models.CASCADE,
        related_name="access_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="document_access_logs",
    )
    action = models.CharField(
        max_length=20,
        choices=DocumentAccessAction.choices,
        db_index=True,
    )
    accessed_at = models.DateTimeField(default=timezone.now, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "document_access_logs"
        ordering = ["-accessed_at", "-id"]

    def __str__(self):
        return f"{self.action} on doc {self.document_id} by {self.user_id or 'anon'}"


# =====================================================
# DELIVERY
# =====================================================


class OperationalCancellation(models.Model):
    class SourceType(models.TextChoices):
        DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
        BILLING_INVOICE = "BILLING_INVOICE", "Billing Invoice"
        BILLING_RECEIPT = "BILLING_RECEIPT", "Billing Receipt"
        SUBSCRIPTION = "SUBSCRIPTION", "Subscription"
        EMI_PAYMENT = "EMI_PAYMENT", "EMI Payment"
        DELIVERY = "DELIVERY", "Delivery"
        STOCK_REQUIREMENT = "STOCK_REQUIREMENT", "Stock Requirement"
        PURCHASE_INVOICE = "PURCHASE_INVOICE", "Purchase Invoice"
        RENT_CONTRACT = "RENT_CONTRACT", "Rent Contract"
        LEASE_CONTRACT = "LEASE_CONTRACT", "Lease Contract"
        RENT_LEASE_INVOICE = "RENT_LEASE_INVOICE", "Rent/Lease Invoice"
        PAYOUT_BATCH = "PAYOUT_BATCH", "Payout Batch"
        OTHER = "OTHER", "Other"

    class CancellationType(models.TextChoices):
        CANCEL_DRAFT = "CANCEL_DRAFT", "Cancel Draft"
        VOID_UNPOSTED = "VOID_UNPOSTED", "Void Unposted"
        CANCEL_WITH_REVERSAL = "CANCEL_WITH_REVERSAL", "Cancel With Reversal"
        MANUAL_SETTLEMENT = "MANUAL_SETTLEMENT", "Manual Settlement"
        PAYMENT_REVERSAL = "PAYMENT_REVERSAL", "Payment Reversal"
        DELIVERY_CANCEL = "DELIVERY_CANCEL", "Delivery Cancel"
        STOCK_REQUIREMENT_CANCEL = "STOCK_REQUIREMENT_CANCEL", "Stock Requirement Cancel"
        CONTRACT_TERMINATION = "CONTRACT_TERMINATION", "Contract Termination"

    source_type = models.CharField(max_length=40, choices=SourceType.choices, db_index=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    source_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="operational_cancellations",
    )
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_operational_cancellations",
    )
    amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status_before = models.CharField(max_length=40, blank=True, default="")
    status_after = models.CharField(max_length=40, blank=True, default="")
    cancellation_type = models.CharField(max_length=40, choices=CancellationType.choices, db_index=True)
    reason = models.TextField()
    internal_note = models.TextField(blank=True, default="")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="requested_operational_cancellations",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_operational_cancellations",
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cancelled_operational_records",
    )
    cancelled_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    reversal_reference = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    audit_log_reference = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "operational_cancellations"
        ordering = ["-cancelled_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source_type", "source_id"],
                name="uq_operational_cancellation_source",
            )
        ]
        indexes = [
            models.Index(fields=["source_type", "cancelled_at"]),
            models.Index(fields=["customer", "cancelled_at"]),
            models.Index(fields=["cancelled_by", "cancelled_at"]),
        ]

    def clean(self):
        if not (self.reason or "").strip():
            raise ValidationError({"reason": "Cancellation reason is required."})
        if not self.cancelled_by_id:
            raise ValidationError({"cancelled_by": "Cancelled by is required."})

    def save(self, *args, **kwargs):
        self.source_reference = (self.source_reference or "").strip()
        self.status_before = (self.status_before or "").strip().upper()
        self.status_after = (self.status_after or "").strip().upper()
        self.reason = (self.reason or "").strip()
        self.internal_note = (self.internal_note or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip() or None
        self.audit_log_reference = (self.audit_log_reference or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)


# =====================================================
# BUSINESS EVENT LOG (APPEND-ONLY)
# =====================================================



class ContractAmendment(models.Model):
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="amendments",
    )
    amendment_type = models.CharField(
        max_length=40,
        choices=ContractAmendmentType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=ContractAmendmentStatus.choices,
        default=ContractAmendmentStatus.REQUESTED,
        db_index=True,
    )
    previous_values = models.JSONField(default=dict)
    new_values = models.JSONField(default=dict)
    reason = models.TextField()
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_contract_amendments",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_contract_amendments",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejection_reason = models.TextField(blank=True, default="")
    applied_at = models.DateTimeField(null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "contract_amendments"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"], name="contract_am_subscri_b9ee13_idx"),
            models.Index(fields=["amendment_type", "status"], name="contract_am_amendme_c02dce_idx"),
        ]

    def __str__(self):
        return f"Amendment [{self.amendment_type}] on Sub#{self.subscription_id} [{self.status}]"



class ContractRecontractEvent(models.Model):
    class ImpactType(models.TextChoices):
        UPGRADE_EXTRA_PAYABLE = "UPGRADE_EXTRA_PAYABLE", "Upgrade Extra Payable"
        DOWNGRADE_CREDIT_REQUIRED = "DOWNGRADE_CREDIT_REQUIRED", "Downgrade Credit Required"
        SAME_PRICE_REFERENCE_CORRECTION = "SAME_PRICE_REFERENCE_CORRECTION", "Same Price Reference Correction"

    class Status(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        CANCELLED = "CANCELLED", "Cancelled"

    class CustomerConsentStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    class AdminApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    amendment = models.ForeignKey(
        ContractAmendment,
        on_delete=models.PROTECT,
        related_name="recontract_events",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="recontract_events",
    )
    old_product = models.ForeignKey('products_core.Product',
        on_delete=models.PROTECT,
        related_name="recontract_events_as_old_product",
        null=True,
        blank=True,
    )
    new_product = models.ForeignKey('products_core.Product',
        on_delete=models.PROTECT,
        related_name="recontract_events_as_new_product",
        null=True,
        blank=True,
    )
    old_contract_total = models.DecimalField(max_digits=12, decimal_places=2)
    new_contract_total = models.DecimalField(max_digits=12, decimal_places=2)
    price_difference = models.DecimalField(max_digits=12, decimal_places=2)
    amount_already_paid = models.DecimalField(max_digits=12, decimal_places=2)
    old_remaining_balance = models.DecimalField(max_digits=12, decimal_places=2)
    new_remaining_balance = models.DecimalField(max_digits=12, decimal_places=2)
    current_tenure_months = models.PositiveIntegerField()
    preview_tenure_months = models.PositiveIntegerField()
    current_monthly_amount = models.DecimalField(max_digits=12, decimal_places=2)
    proposed_monthly_amount = models.DecimalField(max_digits=12, decimal_places=2)
    pending_emi_count = models.PositiveIntegerField(default=0)
    impact_type = models.CharField(max_length=40, choices=ImpactType.choices, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PREVIEWED, db_index=True)
    effective_date_preview = models.DateField(null=True, blank=True)
    preview_snapshot = models.JSONField(default=dict, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    blocked_reason = models.TextField(null=True, blank=True)
    source_record_mutation = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_recontract_preview_events",
        null=True,
        blank=True,
    )
    customer_consent_status = models.CharField(
        max_length=20,
        choices=CustomerConsentStatus.choices,
        default=CustomerConsentStatus.PENDING,
        db_index=True,
    )
    customer_consented_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customer_recontract_consents",
        null=True,
        blank=True,
    )
    customer_consented_at = models.DateTimeField(null=True, blank=True)
    customer_consent_note = models.TextField(null=True, blank=True)
    customer_consent_snapshot = models.JSONField(default=dict, blank=True)
    admin_approval_status = models.CharField(
        max_length=20,
        choices=AdminApprovalStatus.choices,
        default=AdminApprovalStatus.PENDING,
        db_index=True,
    )
    admin_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="admin_recontract_approval_decisions",
        null=True,
        blank=True,
    )
    admin_approved_at = models.DateTimeField(null=True, blank=True)
    admin_approval_note = models.TextField(null=True, blank=True)
    admin_approval_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "contract_recontract_events"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["amendment", "status"], name="recontract_am_status_idx"),
            models.Index(fields=["subscription", "created_at"], name="recontract_sub_created_idx"),
            models.Index(fields=["impact_type", "status"], name="recontract_impact_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(old_contract_total__gte=0), name="chk_recontract_old_total_gte0"),
            models.CheckConstraint(condition=Q(new_contract_total__gte=0), name="chk_recontract_new_total_gte0"),
            models.CheckConstraint(condition=Q(amount_already_paid__gte=0), name="chk_recontract_paid_gte0"),
            models.CheckConstraint(condition=Q(old_remaining_balance__gte=0), name="chk_recontract_old_bal_gte0"),
            models.CheckConstraint(condition=Q(new_remaining_balance__gte=0), name="chk_recontract_new_bal_gte0"),
            models.CheckConstraint(condition=Q(current_monthly_amount__gte=0), name="chk_recontract_cur_emi_gte0"),
            models.CheckConstraint(condition=Q(proposed_monthly_amount__gte=0), name="chk_recontract_new_emi_gte0"),
            models.CheckConstraint(condition=Q(current_tenure_months__gt=0), name="chk_recontract_cur_ten_gt0"),
            models.CheckConstraint(condition=Q(preview_tenure_months__gt=0), name="chk_recontract_prev_ten_gt0"),
            models.CheckConstraint(condition=Q(source_record_mutation=False), name="chk_recontract_no_src_mut"),
        ]

    def clean(self):
        errors = {}
        if self.subscription_id and self.amendment_id:
            source = self.amendment.source_contract()
            if source and source.pk != self.subscription_id:
                errors["subscription"] = "Recontract event subscription must match amendment source contract."
        if self.source_record_mutation:
            errors["source_record_mutation"] = "Phase 6A preview persistence cannot mutate source records."
        if not isinstance(self.preview_snapshot, dict):
            errors["preview_snapshot"] = "Preview snapshot must be a JSON object."
        if not isinstance(self.warnings, list):
            errors["warnings"] = "Warnings must be a JSON list."
        if not isinstance(self.customer_consent_snapshot, dict):
            errors["customer_consent_snapshot"] = "Customer consent snapshot must be a JSON object."
        if not isinstance(self.admin_approval_snapshot, dict):
            errors["admin_approval_snapshot"] = "Admin approval snapshot must be a JSON object."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.source_record_mutation = False
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Recontract preview #{self.pk} for amendment {self.amendment_id} [{self.status}]"



class ContractRecontractScheduleLine(models.Model):
    class ProposedStatus(models.TextChoices):
        PREVIEW_ONLY = "PREVIEW_ONLY", "Preview Only"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    class AdjustmentType(models.TextChoices):
        EXISTING_PENDING_REPLACEMENT = "EXISTING_PENDING_REPLACEMENT", "Existing Pending Replacement"
        NEW_ADDITIONAL_EMI = "NEW_ADDITIONAL_EMI", "New Additional EMI"
        REDUCED_EMI = "REDUCED_EMI", "Reduced EMI"
        CREDIT_OFFSET = "CREDIT_OFFSET", "Credit Offset"

    event = models.ForeignKey(
        ContractRecontractEvent,
        on_delete=models.PROTECT,
        related_name="schedule_preview_lines",
    )
    line_no = models.PositiveIntegerField()
    original_emi = models.ForeignKey('payments.Emi',
        on_delete=models.PROTECT,
        related_name="recontract_schedule_preview_lines",
        null=True,
        blank=True,
    )
    original_due_date = models.DateField(null=True, blank=True)
    original_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    proposed_due_date = models.DateField()
    proposed_amount = models.DecimalField(max_digits=12, decimal_places=2)
    proposed_principal_component = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    proposed_status = models.CharField(
        max_length=20,
        choices=ProposedStatus.choices,
        default=ProposedStatus.PREVIEW_ONLY,
        db_index=True,
    )
    adjustment_type = models.CharField(max_length=40, choices=AdjustmentType.choices, db_index=True)
    source_record_mutation = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "contract_recontract_schedule_lines"
        ordering = ["event_id", "line_no", "id"]
        indexes = [
            models.Index(fields=["event", "line_no"], name="recon_sch_ev_line_idx"),
            models.Index(fields=["event", "adjustment_type"], name="recon_sch_ev_adj_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(line_no__gt=0), name="chk_recontract_sched_line_gt0"),
            models.CheckConstraint(condition=Q(proposed_amount__gte=0), name="chk_recontract_sched_prop_amt_gte0"),
            models.CheckConstraint(condition=Q(source_record_mutation=False), name="chk_recontract_sched_no_src_mut"),
        ]

    def clean(self):
        errors = {}
        if self.source_record_mutation:
            errors["source_record_mutation"] = "Schedule preview lines must not mutate source records."
        if self.original_emi_id:
            if self.event_id and self.original_emi.subscription_id != self.event.subscription_id:
                errors["original_emi"] = "Original EMI must belong to the same subscription as the recontract event."
            if self.original_emi.status != EmiStatus.PENDING:
                errors["original_emi"] = "Only pending EMI rows can be referenced by schedule preview lines."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.source_record_mutation = False
        self.full_clean()
        super().save(*args, **kwargs)



class ContractRecontractFinancialImpactPreview(models.Model):
    class ImpactType(models.TextChoices):
        UPGRADE_EXTRA_PAYABLE = "UPGRADE_EXTRA_PAYABLE", "Upgrade Extra Payable"
        DOWNGRADE_CREDIT_REQUIRED = "DOWNGRADE_CREDIT_REQUIRED", "Downgrade Credit Required"
        SAME_PRICE_REFERENCE_CORRECTION = "SAME_PRICE_REFERENCE_CORRECTION", "Same Price Reference Correction"

    class PreviewStatus(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        BLOCKED = "BLOCKED", "Blocked"
        CANCELLED = "CANCELLED", "Cancelled"

    event = models.ForeignKey(
        ContractRecontractEvent,
        on_delete=models.PROTECT,
        related_name="financial_impact_previews",
    )
    impact_type = models.CharField(max_length=40, choices=ImpactType.choices, db_index=True)
    accounting_preview_status = models.CharField(
        max_length=20,
        choices=PreviewStatus.choices,
        default=PreviewStatus.PREVIEWED,
        db_index=True,
    )
    reconciliation_preview_status = models.CharField(
        max_length=20,
        choices=PreviewStatus.choices,
        default=PreviewStatus.PREVIEWED,
        db_index=True,
    )
    price_difference = models.DecimalField(max_digits=12, decimal_places=2)
    additional_receivable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    credit_or_reduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    projected_customer_balance = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    projected_future_emi_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    journal_preview = models.JSONField(default=dict, blank=True)
    reconciliation_preview = models.JSONField(default=dict, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    blocked_reason = models.TextField(null=True, blank=True)
    source_record_mutation = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_recontract_financial_impact_previews",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "contract_recontract_financial_impact_previews"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["event", "accounting_preview_status"], name="recon_fin_prev_evt_acc_idx"),
            models.Index(fields=["event", "reconciliation_preview_status"], name="recon_fin_prev_evt_rec_idx"),
            models.Index(fields=["impact_type"], name="recon_fin_prev_impact_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(additional_receivable_amount__gte=0), name="chk_recon_fin_add_recv_gte0"),
            models.CheckConstraint(condition=Q(credit_or_reduction_amount__gte=0), name="chk_recon_fin_credit_gte0"),
            models.CheckConstraint(condition=Q(projected_customer_balance__gte=0), name="chk_recon_fin_cust_bal_gte0"),
            models.CheckConstraint(condition=Q(projected_future_emi_total__gte=0), name="chk_recon_fin_emi_total_gte0"),
            models.CheckConstraint(condition=Q(source_record_mutation=False), name="chk_recon_fin_no_src_mut"),
        ]

    def clean(self):
        errors = {}
        if self.source_record_mutation:
            errors["source_record_mutation"] = "Financial impact previews cannot mutate source records."
        if not isinstance(self.journal_preview, dict):
            errors["journal_preview"] = "Journal preview must be a JSON object."
        if not isinstance(self.reconciliation_preview, dict):
            errors["reconciliation_preview"] = "Reconciliation preview must be a JSON object."
        if not isinstance(self.warnings, list):
            errors["warnings"] = "Warnings must be a JSON list."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.source_record_mutation = False
        self.full_clean()
        super().save(*args, **kwargs)



class SubscriptionGuarantor(TimeStampedModel):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="guarantors",
    )
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, db_index=True)
    relation = models.CharField(
        max_length=16,
        choices=GuarantorRelation.choices,
        default=GuarantorRelation.OTHER,
    )
    aadhaar_no = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_primary = models.BooleanField(default=False, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "subscriptions_guarantors"
        ordering = ["-is_primary", "id"]
        indexes = [
            models.Index(fields=["subscription", "is_primary"]),
        ]

    def __str__(self):
        return f"Guarantor({self.name}) for Sub#{self.subscription_id}"

    def clean(self):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        raw = (self.aadhaar_no or "").strip()
        if raw:
            digits = "".join(c for c in raw if c.isdigit())
            # DPDP 2023 s.8 — store only last 4 digits; mask remainder.
            self.aadhaar_no = "XXXX-XXXX-" + digits[-4:] if len(digits) >= 4 else raw
        else:
            self.aadhaar_no = raw
        if not self.name:
            raise ValidationError({"name": "Guarantor name is required."})
        if not self.phone:
            raise ValidationError({"phone": "Guarantor phone is required."})


# ---------------------------------------------------------------------------
# RecoveryCase — defaulter recovery workflow
# ---------------------------------------------------------------------------


