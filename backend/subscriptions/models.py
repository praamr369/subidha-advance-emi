from decimal import Decimal
import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils import timezone


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

# =====================================================
# CORE ENTITIES
# =====================================================

class Customer(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile"
    )
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15)
    kyc_status = models.CharField(
        max_length=20,
        choices=KycStatus.choices,
        default=KycStatus.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customers"
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["kyc_status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Product(models.Model):
    product_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "products"
        indexes = [
            models.Index(fields=["product_code"]),
        ]

    def __str__(self):
        return f"{self.product_code} - {self.name}"


# =====================================================
# BATCH
# =====================================================

class Batch(models.Model):
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
    
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "batches"
        indexes = [
        models.Index(fields=["status"]),
        ]
        constraints = [
            models.CheckConstraint(
            condition=Q(total_slots__gt=0),
            name="chk_batch_total_slots_positive"
            ),
            models.CheckConstraint(
            condition=Q(duration_months__gt=0),
            name="chk_batch_duration_positive"
            ),
            models.CheckConstraint(
            condition=Q(draw_day__gte=1) & Q(draw_day__lte=28),
            name="chk_batch_draw_day_range"
            ),
        ]

    def clean(self):
        if not (1 <= self.draw_day <= 28):
            raise ValidationError("Draw day must be between 1 and 28.")
        if self.total_slots <= 0:
            raise ValidationError("Total slots must be greater than zero.")
        if self.status == BatchStatus.OPEN and self.total_slots != 100:
            raise ValidationError("Open batch must have exactly 100 slots.")

    def available_slots(self):
        return self.lucky_ids.filter(
            status=LuckyIdStatus.AVAILABLE
        ).count()


# =====================================================
# LUCKY ID
# =====================================================

class LuckyId(models.Model):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_ids"
    )
    lucky_number = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=LuckyIdStatus.choices,
        default=LuckyIdStatus.AVAILABLE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lucky_ids"
        indexes = [
            models.Index(fields=["batch", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "lucky_number"],
                name="uq_lucky_id_per_batch"
            ),
            models.CheckConstraint(
                condition=Q(lucky_number__gte=0) & Q(lucky_number__lte=99),
                name="chk_lucky_number_range"
            ),
        ]

    def clean(self):
        if not (0 <= self.lucky_number <= 99):
            raise ValidationError("Lucky number must be between 00 and 99.")
        if self.pk:
            old = LuckyId.objects.get(pk=self.pk)
            if self.batch_id != old.batch_id or self.lucky_number != old.lucky_number:
                raise ValidationError("Lucky ID batch or number cannot be changed.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


# =====================================================
# SUBSCRIPTION
# =====================================================

class Subscription(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="subscriptions")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    partner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True)
    lucky_id = models.ForeignKey(LuckyId, on_delete=models.PROTECT, null=True, blank=True)
    plan_type = models.CharField(max_length=10, choices=PlanType.choices)
    tenure_months = models.PositiveIntegerField()
    start_date = models.DateField()
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    monthly_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=SubscriptionStatus.choices, default=SubscriptionStatus.ACTIVE)
    winner_month = models.PositiveIntegerField(null=True, blank=True)
    waived_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "subscriptions"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["batch"]),
            models.Index(fields=["customer"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "batch"],
                condition=Q(plan_type=PlanType.EMI),
                name="unique_customer_batch_emi"
            ),
            models.CheckConstraint(
                condition=(
                    Q(plan_type=PlanType.EMI, lucky_id__isnull=False) |
                    ~Q(plan_type=PlanType.EMI)
                ),
                name="chk_lucky_id_required_for_emi"
            ),
            models.UniqueConstraint(
                fields=["lucky_id"],
                condition=Q(plan_type=PlanType.EMI),
                name="uq_subscription_per_lucky_id"
            ),
            models.CheckConstraint(
                condition=Q(total_amount__gt=0),
                name="chk_subscription_total_positive"
            ),
            models.CheckConstraint(
                condition=Q(monthly_amount__gt=0),
                name="chk_subscription_monthly_positive"
            ),
            models.CheckConstraint(
                condition=Q(tenure_months__gt=0),
                name="chk_subscription_tenure_positive"
            ),
        ]

    def clean(self):
        if self.plan_type == PlanType.EMI:

            if not self.batch:
                raise ValidationError("EMI subscription requires a batch.")

            if not self.lucky_id:
                raise ValidationError("EMI subscription requires a lucky ID.")

            if self.lucky_id.batch_id != self.batch_id:
                raise ValidationError(
                "Lucky ID must belong to the selected batch."
                )
            
            if self.plan_type == PlanType.EMI:
                if self.batch and self.tenure_months != self.batch.duration_months:
                    raise ValidationError(
            "Tenure must match batch duration."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


# =====================================================
# EMI
# =====================================================

class Emi(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="emis")
    month_no = models.PositiveIntegerField()
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=EmiStatus.choices, default=EmiStatus.PENDING)

    class Meta:
        db_table = "emis"
        unique_together = ("subscription", "month_no")
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="chk_emi_amount_positive"),
            models.CheckConstraint(condition=Q(month_no__gt=0), name="chk_emi_month_positive"),
            
        ]

    def total_paid(self):
        return self.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    def balance_amount(self):
        return self.amount - self.total_paid()

    def is_fully_paid(self):
        return self.balance_amount() <= Decimal("0.00")


# =====================================================
# PAYMENT
# =====================================================

class Payment(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT)
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT)
    emi = models.ForeignKey(Emi, on_delete=models.PROTECT, null=True, blank=True, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    reference_no = models.CharField(max_length=100, unique=True, null=True, blank=True, db_index=True)
    payment_date = models.DateField()
    collected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,related_name="collected_payments")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,related_name="verified_payments")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "payments"
        indexes = [
            models.Index(fields=["payment_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference_no"],
                condition=Q(reference_no__isnull=False),
                name="uq_payment_reference_no",
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_payment_amount_positive"
            ),
        ]


# =====================================================
# FINANCIAL LEDGER
# =====================================================


# =====================================================
# LUCKY DRAW
# =====================================================

class LuckyDraw(models.Model):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_draws"
    )

    committed_hash = models.CharField(max_length=64)
    revealed_seed = models.CharField(
        max_length=128,
        null=True,
        blank=True
    )

    winner_lucky_id = models.ForeignKey(
        LuckyId,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wins"
    )

    draw_date = models.DateTimeField(default=timezone.now)
    draw_month = models.PositiveIntegerField()
    is_revealed = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lucky_draws"
        unique_together = ("batch", "draw_month")

    def verify_commitment(self):
        if not self.revealed_seed:
            return False

        recalculated = hashlib.sha256(
            self.revealed_seed.encode()
        ).hexdigest()

        return recalculated == self.committed_hash

    def clean(self):
        if self.winner_lucky_id:
            if self.winner_lucky_id.batch_id != self.batch_id:
                raise ValidationError(
                    "Winner Lucky ID must belong to same batch."
                )

    @transaction.atomic
    def save(self, *args, **kwargs):
        # NO business side effects inside model
        self.full_clean()
        super().save(*args, **kwargs)

# =========class Fi============================================
# AUDIT LOG
# =====================================================

class AuditLog(models.Model):

    class ActionType(models.TextChoices):
        SUB_CREATED = "SUB_CREATED", "Subscription Created"
        EMI_PAID = "EMI_PAID", "EMI Paid"
        DRAW_EXECUTED = "DRAW_EXECUTED", "Draw Executed"
        EMI_WAIVED = "EMI_WAIVED", "EMI Waived"
        COMMISSION_CREATED = "COMMISSION_CREATED", "Commission Created"

    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        default=ActionType.SUB_CREATED,
        db_index=True
    )

    model_name = models.CharField(
        max_length=100,
        db_index=True
    )

    object_id = models.PositiveIntegerField(db_index=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="audit_logs",
        null=True,
        blank=True
    )

    metadata = models.JSONField(default=dict)

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]

# =====================================================
# FINANCIAL LEDGER
# =====================================================

class FinancialLedger(models.Model):

    payment = models.OneToOneField(
        "Payment",
        on_delete=models.PROTECT,
        related_name="ledger_entry",
        null=True,
        blank=True
    )

    emi = models.ForeignKey(
        "Emi",
        on_delete=models.PROTECT,
        related_name="ledger_entries"
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    entry_type = models.CharField(
        max_length=20,
        default="EMI_PAYMENT"
    )
    entry_direction = models.CharField(
        max_length=10,
        choices=[("DEBIT", "Debit"), ("CREDIT", "Credit")]
    )

    created_at = models.DateTimeField(
        default=timezone.now
    )

    class Meta:
        db_table = "financial_ledger"
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="ledger_amount_non_negative"
            )
        ]

# =====================================================
# COMMISSION
# =====================================================

class Commission(models.Model):

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("PAID", "Paid"),
    ]

    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commissions"
    )

    emi = models.OneToOneField(
        "Emi",
        on_delete=models.CASCADE,
        related_name="commission"
    )

    commission_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2
    )

    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING"
    )

    is_settled = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commissions"
        constraints = [
            models.UniqueConstraint(
                fields=["partner", "emi"],
                name="uq_partner_emi_commission"
            )
        ]

    def clean(self):
        if self.commission_amount != (
            self.emi.amount * self.commission_percentage / Decimal("100")
        ):
            raise ValidationError("Commission amount mismatch.")
        if getattr(self.partner, "role", None) != "PARTNER":
            raise ValidationError(
                "Commission only allowed for partner users."
            )
# =====================================================
# COMMISSION PAYOUT BATCH
# =====================================================

class CommissionPayoutBatch(models.Model):

    month = models.DateField()

    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2
    )

    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commission_payout_batches"


class PartnerPayout(models.Model):

    payout_batch = models.ForeignKey(
        CommissionPayoutBatch,
        related_name="partner_payouts",
        on_delete=models.CASCADE
    )

    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )

    total_commission = models.DecimalField(
        max_digits=14,
        decimal_places=2
    )

    commission_count = models.PositiveIntegerField()

    is_paid = models.BooleanField(default=False)

    paid_at = models.DateTimeField(
        null=True,
        blank=True
    )

    class Meta:
        db_table = "partner_payouts"
        unique_together = ("payout_batch", "partner")
