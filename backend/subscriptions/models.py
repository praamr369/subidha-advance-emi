from decimal import Decimal, ROUND_HALF_UP
import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils import timezone


MONEY_ZERO = Decimal("0.00")
HUNDRED = Decimal("100.00")


# =====================================================
# ENUMS
# =====================================================

class PlanType(models.TextChoices):
    EMI = "EMI", "EMI"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    WON = "WON", "Won"
    COMPLETED = "COMPLETED", "Completed"
    DEFAULTED = "DEFAULTED", "Defaulted"


class LuckyIdStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    ASSIGNED = "ASSIGNED", "Assigned"
    WON = "WON", "Won"


class EmiStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PAID = "PAID", "Paid"
    WAIVED = "WAIVED", "Waived"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    UPI = "UPI", "UPI"
    BANK = "BANK", "Bank"


class KycStatus(models.TextChoices):
    NOT_PROVIDED = "NOT_PROVIDED", "Not Provided"
    PENDING = "PENDING", "Pending Verification"
    VERIFIED = "VERIFIED", "Verified"
    REJECTED = "REJECTED", "Rejected"


class BatchStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    OPEN = "OPEN", "Open"
    FULL = "FULL", "Full"
    DRAW_IN_PROGRESS = "DRAW_IN_PROGRESS", "Draw In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CLOSED = "CLOSED", "Closed"


class LedgerEntryType(models.TextChoices):
    EMI_PAYMENT = "EMI_PAYMENT", "EMI Payment"
    EMI_WAIVER = "EMI_WAIVER", "EMI Waiver"
    PAYMENT_REVERSAL = "PAYMENT_REVERSAL", "Payment Reversal"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"


class LedgerDirection(models.TextChoices):
    DEBIT = "DEBIT", "Debit"
    CREDIT = "CREDIT", "Credit"


class CommissionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    PAID = "PAID", "Paid"


# =====================================================
# BASE / HELPERS
# =====================================================

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        abstract = True


def q2(value: Decimal) -> Decimal:
    return (value or MONEY_ZERO).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# =====================================================
# CORE ENTITIES
# =====================================================

class Customer(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15)
    kyc_status = models.CharField(
        max_length=20,
        choices=KycStatus.choices,
        default=KycStatus.PENDING,
        db_index=True,
    )

    class Meta:
        db_table = "customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["kyc_status"]),
            models.Index(fields=["name"]),
        ]

    def clean(self):
        if not self.name or not self.name.strip():
            raise ValidationError({"name": "Customer name is required."})

        normalized_phone = (self.phone or "").strip()
        if not normalized_phone:
            raise ValidationError({"phone": "Phone number is required."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def total_paid_amount(self) -> Decimal:
        return q2(
            Payment.objects.filter(customer=self).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Product(TimeStampedModel):
    product_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "products"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["product_code"]),
            models.Index(fields=["name"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(base_price__gt=0),
                name="chk_product_base_price_positive",
            ),
        ]

    def clean(self):
        if not self.product_code or not self.product_code.strip():
            raise ValidationError({"product_code": "Product code is required."})
        if not self.name or not self.name.strip():
            raise ValidationError({"name": "Product name is required."})
        if self.base_price is None or self.base_price <= MONEY_ZERO:
            raise ValidationError({"base_price": "Base price must be greater than zero."})

    def save(self, *args, **kwargs):
        self.product_code = (self.product_code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product_code} - {self.name}"


# =====================================================
# BATCH
# =====================================================

class Batch(TimeStampedModel):
    batch_code = models.CharField(max_length=50, unique=True)
    total_slots = models.PositiveIntegerField()
    duration_months = models.PositiveIntegerField()
    draw_day = models.PositiveIntegerField()
    start_date = models.DateField()
    status = models.CharField(
        max_length=30,
        choices=BatchStatus.choices,
        default=BatchStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        db_table = "batches"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["start_date"]),
            models.Index(fields=["batch_code"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_slots__gt=0),
                name="chk_batch_total_slots_positive",
            ),
            models.CheckConstraint(
                condition=Q(duration_months__gt=0),
                name="chk_batch_duration_positive",
            ),
            models.CheckConstraint(
                condition=Q(draw_day__gte=1) & Q(draw_day__lte=28),
                name="chk_batch_draw_day_range",
            ),
        ]

    def clean(self):
        if not self.batch_code or not self.batch_code.strip():
            raise ValidationError({"batch_code": "Batch code is required."})

        if self.total_slots <= 0:
            raise ValidationError({"total_slots": "Total slots must be greater than zero."})

        if self.duration_months <= 0:
            raise ValidationError({"duration_months": "Duration must be greater than zero."})

        if not (1 <= self.draw_day <= 28):
            raise ValidationError({"draw_day": "Draw day must be between 1 and 28."})

        if self.status == BatchStatus.OPEN and self.total_slots != 100:
            raise ValidationError({"total_slots": "Open batch must have exactly 100 slots."})

    def save(self, *args, **kwargs):
        self.batch_code = (self.batch_code or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def available_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).count()

    def assigned_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count()

    def won_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.WON).count()

    def sold_slots(self) -> int:
        return self.lucky_ids.exclude(status=LuckyIdStatus.AVAILABLE).count()

    def is_full(self) -> bool:
        return self.available_slots() <= 0

    def __str__(self):
        return self.batch_code


# =====================================================
# LUCKY ID
# =====================================================

class LuckyId(TimeStampedModel):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_ids",
    )
    lucky_number = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=LuckyIdStatus.choices,
        default=LuckyIdStatus.AVAILABLE,
        db_index=True,
    )

    class Meta:
        db_table = "lucky_ids"
        ordering = ["batch_id", "lucky_number"]
        indexes = [
            models.Index(fields=["batch", "status"]),
            models.Index(fields=["batch", "lucky_number"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "lucky_number"],
                name="uq_lucky_id_per_batch",
            ),
            models.CheckConstraint(
                condition=Q(lucky_number__gte=0) & Q(lucky_number__lte=99),
                name="chk_lucky_number_range",
            ),
        ]

    def clean(self):
        if not (0 <= self.lucky_number <= 99):
            raise ValidationError({"lucky_number": "Lucky number must be between 00 and 99."})

        if self.pk:
            old = LuckyId.objects.only("batch_id", "lucky_number").get(pk=self.pk)
            if self.batch_id != old.batch_id:
                raise ValidationError({"batch": "Lucky ID batch cannot be changed."})
            if self.lucky_number != old.lucky_number:
                raise ValidationError({"lucky_number": "Lucky number cannot be changed."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def display_number(self) -> str:
        return f"{self.lucky_number:02d}"

    def __str__(self):
        return f"{self.batch.batch_code}-{self.display_number}"


# =====================================================
# SUBSCRIPTION
# =====================================================

class Subscription(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )
    product = models.ForeignKey(
        Product,
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
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    lucky_id = models.ForeignKey(
        LuckyId,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    plan_type = models.CharField(max_length=10, choices=PlanType.choices, db_index=True)
    tenure_months = models.PositiveIntegerField()
    start_date = models.DateField()
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
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(plan_type=PlanType.EMI, batch__isnull=False, lucky_id__isnull=False)
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
                raise ValidationError({"lucky_id": "EMI subscription requires a lucky ID."})

            if self.lucky_id.batch_id != self.batch_id:
                raise ValidationError({"lucky_id": "Lucky ID must belong to the selected batch."})

            if self.tenure_months != self.batch.duration_months:
                raise ValidationError({"tenure_months": "Tenure must match batch duration."})

            # Only enforce AVAILABLE when creating or when changing lucky_id
            lucky_id_changed = False
            if self.pk:
                old = Subscription.objects.filter(pk=self.pk).only("lucky_id_id").first()
                lucky_id_changed = bool(old and old.lucky_id_id != self.lucky_id_id)

            if (not self.pk or lucky_id_changed) and self.lucky_id.status != LuckyIdStatus.AVAILABLE:
                raise ValidationError({"lucky_id": "Selected Lucky ID is not available."})

        else:
            # Future-safe for RENT / LEASE
            if self.batch_id or self.lucky_id_id:
                raise ValidationError(
                    {"batch": "Only EMI subscriptions can have batch/lucky ID mapping."}
                )

        if self.winner_month is not None and self.winner_month <= 0:
            raise ValidationError({"winner_month": "Winner month must be positive."})

    def save(self, *args, **kwargs):
        self.full_clean()

        previous_lucky_id_id = None
        if self.pk:
            old = Subscription.objects.filter(pk=self.pk).only("lucky_id_id").first()
            previous_lucky_id_id = old.lucky_id_id if old else None

        with transaction.atomic():
            super().save(*args, **kwargs)

            # Keep LuckyId status synchronized for EMI plans
            if self.plan_type == PlanType.EMI and self.lucky_id_id:
                LuckyId.objects.filter(pk=self.lucky_id_id).update(
                    status=LuckyIdStatus.WON
                    if self.status == SubscriptionStatus.WON
                    else LuckyIdStatus.ASSIGNED
                )

            if previous_lucky_id_id and previous_lucky_id_id != self.lucky_id_id:
                still_used = Subscription.objects.filter(
                    lucky_id_id=previous_lucky_id_id
                ).exclude(pk=self.pk).exists()
                if not still_used:
                    LuckyId.objects.filter(pk=previous_lucky_id_id).update(
                        status=LuckyIdStatus.AVAILABLE
                    )

    def total_paid(self) -> Decimal:
        return q2(
            self.payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )

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
# EMI
# =====================================================

class Emi(TimeStampedModel):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="emis",
    )
    month_no = models.PositiveIntegerField()
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=EmiStatus.choices,
        default=EmiStatus.PENDING,
        db_index=True,
    )

    class Meta:
        db_table = "emis"
        ordering = ["subscription_id", "month_no"]
        unique_together = ("subscription", "month_no")
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["subscription", "month_no"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_emi_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(month_no__gt=0),
                name="chk_emi_month_positive",
            ),
        ]

    def clean(self):
        if self.amount is None or self.amount <= MONEY_ZERO:
            raise ValidationError({"amount": "EMI amount must be greater than zero."})

        if self.month_no <= 0:
            raise ValidationError({"month_no": "Month number must be greater than zero."})

        if self.subscription_id:
            if self.month_no > self.subscription.tenure_months:
                raise ValidationError(
                    {"month_no": "Month number cannot exceed subscription tenure."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def total_paid(self) -> Decimal:
        return q2(
            self.payments.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
        )

    def balance_amount(self) -> Decimal:
        balance = q2(self.amount) - q2(self.total_paid())
        return q2(balance)

    def is_fully_paid(self) -> bool:
        return self.balance_amount() <= MONEY_ZERO

    def is_overdue(self) -> bool:
        return self.status == EmiStatus.PENDING and self.due_date < timezone.now().date()

    def __str__(self):
        return f"EMI #{self.month_no} - Subscription {self.subscription_id}"


# =====================================================
# PAYMENT
# =====================================================

class Payment(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    reference_no = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    payment_date = models.DateField(db_index=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="collected_payments",
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verified_payments",
    )

    class Meta:
        db_table = "payments"
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["payment_date"]),
            models.Index(fields=["method"]),
            models.Index(fields=["subscription"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["emi"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference_no"],
                condition=Q(reference_no__isnull=False),
                name="uq_payment_reference_no",
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_payment_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Payment amount must be greater than zero."

        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer does not match the selected subscription."

        if self.emi_id:
            if self.subscription_id and self.emi.subscription_id != self.subscription_id:
                errors["emi"] = "Selected EMI does not belong to the selected subscription."
            if self.customer_id and self.emi.subscription.customer_id != self.customer_id:
                errors["emi"] = "Selected EMI does not belong to the selected customer."

        if self.reference_no is not None:
            self.reference_no = self.reference_no.strip() or None

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment #{self.pk} - {self.amount}"
# =====================================================
# PAYMENT RECONCILIATION
# =====================================================

class ReconciliationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    MATCHED = "MATCHED", "Matched"
    PARTIAL = "PARTIAL", "Partial"
    OVERPAID = "OVERPAID", "Overpaid"
    UNLINKED = "UNLINKED", "Unlinked"
    MISMATCH = "MISMATCH", "Mismatch"
    FLAGGED = "FLAGGED", "Flagged"
    LOCKED = "LOCKED", "Locked"


class ReconciliationEventType(models.TextChoices):
    CREATED = "CREATED", "Created"
    AUTO_MATCHED = "AUTO_MATCHED", "Auto Matched"
    MANUAL_MATCHED = "MANUAL_MATCHED", "Manual Matched"
    FLAGGED = "FLAGGED", "Flagged"
    NOTE_ADDED = "NOTE_ADDED", "Note Added"
    LOCKED = "LOCKED", "Locked"
    UNLOCKED = "UNLOCKED", "Unlocked"
    STATUS_CHANGED = "STATUS_CHANGED", "Status Changed"


class PaymentReconciliation(models.Model):
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        related_name="reconciliation",
    )

    matched_emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reconciliations",
    )

    status = models.CharField(
        max_length=20,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.PENDING,
        db_index=True,
    )

    expected_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    variance_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    is_flagged = models.BooleanField(default=False, db_index=True)
    is_locked = models.BooleanField(default=False, db_index=True)

    notes = models.TextField(blank=True, default="")

    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reconciliations_done",
    )

    reconciled_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_reconciliations"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["is_flagged"]),
            models.Index(fields=["is_locked"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["payment"]),
            models.Index(fields=["matched_emi"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(expected_amount__gte=0),
                name="chk_reconciliation_expected_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(paid_amount__gte=0),
                name="chk_reconciliation_paid_non_negative",
            ),
        ]

    def clean(self):
        errors = {}

        if self.payment_id:
            if self.paid_amount != self.payment.amount:
                errors["paid_amount"] = "Paid amount must match payment amount."

            if self.matched_emi_id and self.payment.subscription_id != self.matched_emi.subscription_id:
                errors["matched_emi"] = "Matched EMI must belong to the payment subscription."

        if self.expected_amount is not None and self.expected_amount < MONEY_ZERO:
            errors["expected_amount"] = "Expected amount cannot be negative."

        if self.paid_amount is not None and self.paid_amount < MONEY_ZERO:
            errors["paid_amount"] = "Paid amount cannot be negative."

        if self.is_locked and not self.reconciled_at:
            errors["reconciled_at"] = "Locked reconciliation must have reconciled timestamp."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.payment_id and self.paid_amount in (None, MONEY_ZERO):
            self.paid_amount = self.payment.amount

        if self.expected_amount is None:
            self.expected_amount = MONEY_ZERO

        if self.variance_amount is None:
            self.variance_amount = MONEY_ZERO

        self.full_clean()
        super().save(*args, **kwargs)

    def recompute_variance(self):
        self.variance_amount = q2(self.paid_amount - self.expected_amount)
        return self.variance_amount

    def __str__(self):
        return f"Payment {self.payment_id} - {self.status}"


class PaymentReconciliationEvent(models.Model):
    reconciliation = models.ForeignKey(
        PaymentReconciliation,
        on_delete=models.CASCADE,
        related_name="events",
    )

    event_type = models.CharField(
        max_length=30,
        choices=ReconciliationEventType.choices,
        db_index=True,
    )

    old_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20, blank=True, default="")

    message = models.TextField(blank=True, default="")

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reconciliation_events",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "payment_reconciliation_events"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["event_type"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["reconciliation"]),
        ]

    def __str__(self):
        return f"Reconciliation {self.reconciliation_id} - {self.event_type}"   






# =====================================================
# LUCKY DRAW
# =====================================================

class LuckyDraw(TimeStampedModel):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_draws",
    )
    committed_hash = models.CharField(max_length=64)
    revealed_seed = models.CharField(
        max_length=128,
        null=True,
        blank=True,
    )
    winner_lucky_id = models.ForeignKey(
        LuckyId,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wins",
    )
    draw_date = models.DateTimeField(default=timezone.now)
    draw_month = models.PositiveIntegerField()
    is_revealed = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = "lucky_draws"
        ordering = ["-draw_date", "-id"]
        unique_together = ("batch", "draw_month")
        indexes = [
            models.Index(fields=["batch", "draw_month"]),
            models.Index(fields=["is_revealed"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(draw_month__gt=0),
                name="chk_draw_month_positive",
            ),
        ]

    def verify_commitment(self) -> bool:
        if not self.revealed_seed:
            return False
        recalculated = hashlib.sha256(self.revealed_seed.encode()).hexdigest()
        return recalculated == self.committed_hash

    def clean(self):
        errors = {}

        if not self.committed_hash or len(self.committed_hash) != 64:
            errors["committed_hash"] = "Committed hash must be a valid SHA-256 hex string."

        if self.draw_month <= 0:
            errors["draw_month"] = "Draw month must be greater than zero."

        if self.batch_id and self.draw_month and self.batch.duration_months:
            if self.draw_month > self.batch.duration_months:
                errors["draw_month"] = "Draw month cannot exceed batch duration."

        if self.winner_lucky_id and self.winner_lucky_id.batch_id != self.batch_id:
            errors["winner_lucky_id"] = "Winner Lucky ID must belong to the same batch."

        if self.is_revealed:
            if not self.revealed_seed:
                errors["revealed_seed"] = "Revealed seed is required when draw is revealed."
            if not self.winner_lucky_id:
                errors["winner_lucky_id"] = "Winner Lucky ID is required when draw is revealed."

        if errors:
            raise ValidationError(errors)

    @transaction.atomic
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch.batch_code} - Draw {self.draw_month}"


# =====================================================
# AUDIT LOG
# =====================================================

class AuditLog(models.Model):
    class ActionType(models.TextChoices):
        SUB_CREATED = "SUB_CREATED", "Subscription Created"
        EMI_PAID = "EMI_PAID", "EMI Paid"
        EMI_WAIVED = "EMI_WAIVED", "EMI Waived"
        DRAW_EXECUTED = "DRAW_EXECUTED", "Draw Executed"
        COMMISSION_CREATED = "COMMISSION_CREATED", "Commission Created"
        PAYMENT_RECONCILED = "PAYMENT_RECONCILED", "Payment Reconciled"
        PAYMENT_FLAGGED = "PAYMENT_FLAGGED", "Payment Flagged"

    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        default=ActionType.SUB_CREATED,
        db_index=True,
    )
    model_name = models.CharField(max_length=100, db_index=True)
    object_id = models.PositiveIntegerField(db_index=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="audit_logs",
        null=True,
        blank=True,
    )
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action_type", "created_at"]),
            models.Index(fields=["model_name", "object_id"]),
        ]

    def clean(self):
        if not self.model_name or not self.model_name.strip():
            raise ValidationError({"model_name": "Model name is required."})

    def save(self, *args, **kwargs):
        self.model_name = (self.model_name or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.action_type} - {self.model_name}#{self.object_id}"


# =====================================================
# FINANCIAL LEDGER
# =====================================================

class FinancialLedger(TimeStampedModel):
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        related_name="ledger_entry",
        null=True,
        blank=True,
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    entry_type = models.CharField(
        max_length=20,
        choices=LedgerEntryType.choices,
        default=LedgerEntryType.EMI_PAYMENT,
        db_index=True,
    )
    entry_direction = models.CharField(
        max_length=10,
        choices=LedgerDirection.choices,
        db_index=True,
    )

    class Meta:
        db_table = "financial_ledger"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["emi"]),
            models.Index(fields=["entry_type"]),
            models.Index(fields=["entry_direction"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="ledger_amount_non_negative",
            )
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount < MONEY_ZERO:
            errors["amount"] = "Ledger amount cannot be negative."

        if self.payment_id and self.emi_id and self.payment.emi_id:
            if self.payment.emi_id != self.emi_id:
                errors["emi"] = "Ledger EMI must match payment EMI."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.entry_type} - {self.amount}"


# =====================================================
# COMMISSION
# =====================================================

class Commission(TimeStampedModel):
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commissions",
    )
    emi = models.OneToOneField(
        Emi,
        on_delete=models.CASCADE,
        related_name="commission",
    )
    commission_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=CommissionStatus.choices,
        default=CommissionStatus.PENDING,
        db_index=True,
    )
    is_settled = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = "commissions"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["partner", "emi"],
                name="uq_partner_emi_commission",
            ),
            models.CheckConstraint(
                condition=Q(commission_percentage__gte=0) & Q(commission_percentage__lte=100),
                name="chk_commission_percentage_range",
            ),
            models.CheckConstraint(
                condition=Q(commission_amount__gte=0),
                name="chk_commission_amount_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["is_settled"]),
        ]

    def expected_commission_amount(self) -> Decimal:
        raw = q2(self.emi.amount) * q2(self.commission_percentage) / HUNDRED
        return q2(raw)

    def clean(self):
        errors = {}

        if getattr(self.partner, "role", None) != "PARTNER":
            errors["partner"] = "Commission only allowed for partner users."

        expected = self.expected_commission_amount()
        if q2(self.commission_amount) != expected:
            errors["commission_amount"] = (
                f"Commission amount mismatch. Expected {expected}."
            )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Commission #{self.pk} - {self.partner_id}"


# =====================================================
# COMMISSION PAYOUT BATCH
# =====================================================

class CommissionPayoutBatch(models.Model):
    month = models.DateField(db_index=True)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_commission_batches",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commission_payout_batches"
        ordering = ["-month", "-id"]
        indexes = [
            models.Index(fields=["month"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_amount__gte=0),
                name="chk_commission_payout_batch_total_non_negative",
            ),
        ]

    def clean(self):
        if self.total_amount is None or self.total_amount < MONEY_ZERO:
            raise ValidationError({"total_amount": "Total amount cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payout Batch {self.month}"


class PartnerPayout(models.Model):
    payout_batch = models.ForeignKey(
        CommissionPayoutBatch,
        related_name="partner_payouts",
        on_delete=models.CASCADE,
    )
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_payouts",
    )
    total_commission = models.DecimalField(max_digits=14, decimal_places=2)
    commission_count = models.PositiveIntegerField()
    is_paid = models.BooleanField(default=False, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "partner_payouts"
        unique_together = ("payout_batch", "partner")
        indexes = [
            models.Index(fields=["partner", "is_paid"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_commission__gte=0),
                name="chk_partner_payout_total_non_negative",
            ),
        ]

    def clean(self):
        errors = {}

        if getattr(self.partner, "role", None) != "PARTNER":
            errors["partner"] = "Payout partner must be a partner user."

        if self.commission_count < 0:
            errors["commission_count"] = "Commission count cannot be negative."

        if self.is_paid and not self.paid_at:
            errors["paid_at"] = "Paid timestamp is required when payout is marked paid."

        if not self.is_paid and self.paid_at:
            errors["paid_at"] = "Paid timestamp is allowed only for paid payouts."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Partner Payout #{self.pk}"