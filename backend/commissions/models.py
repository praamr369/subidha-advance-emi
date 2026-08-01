from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.utils import timezone
from django.db.models import Q, F
from decimal import Decimal
from django.conf import settings
from subscriptions.enums import *
from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, HUNDRED, q2, _default_branch,
    product_image_upload_to, subscription_document_upload_to,
    customer_photo_upload_to, customer_kyc_doc_upload_to,
    
)

class Commission(models.Model):
    """
    Commission model tied strictly to payment lifecycle.

    Design principles:
    - One commission per payment (enforced via OneToOne)
    - Immutable financial record (status transitions only)
    - Safe for live rent/lease operational compatibility
    """

    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commissions",
    )

    subscription = models.ForeignKey(
        "contracts.Subscription",
        on_delete=models.PROTECT,
        related_name="commissions",
        null=True,
        blank=True,
    )

    payment = models.OneToOneField(
        "payments.Payment",
        on_delete=models.PROTECT,
        related_name="commission",
        null=True,
        blank=True,
    )

    emi = models.ForeignKey(
        "payments.Emi",
        on_delete=models.PROTECT,
        related_name="commissions",
        null=True,
        blank=True,
    )

    # Financial fields
    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    # State
    status = models.CharField(
        max_length=20,
        choices=CommissionStatus.choices,
        default=CommissionStatus.PENDING,
        db_index=True,
    )

    settlement_date = models.DateField(null=True, blank=True)

    reversal_reason = models.TextField(blank=True, default="")

    metadata = models.JSONField(default=dict, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commissions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["payment"]),
        ]

    def clean(self):
        errors = {}

        if self.commission_amount is None or self.commission_amount < MONEY_ZERO:
            errors["commission_amount"] = "Commission amount cannot be negative."

        if self.commission_rate is None or self.commission_rate < MONEY_ZERO:
            errors["commission_rate"] = "Commission rate cannot be negative."
        elif self.commission_rate > HUNDRED:
            errors["commission_rate"] = "Commission rate cannot exceed 100.00."

        if self.partner_id and getattr(self.partner, "role", None) != "PARTNER":
            errors["partner"] = "Commission only allowed for partner users."

        if self.payment_id and self.subscription_id:
            if self.payment.subscription_id != self.subscription_id:
                errors["subscription"] = "Subscription must match payment subscription."

        if self.payment_id and self.emi_id and self.payment.emi_id:
            if self.payment.emi_id != self.emi_id:
                errors["emi"] = "EMI must match payment EMI."

        if errors:
            raise ValidationError(errors)
        


User = settings.AUTH_USER_MODEL



class CommissionPayoutBatch(models.Model):
    class Meta:
        db_table = "subscriptions_commissionpayoutbatch"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        FINALIZED = "FINALIZED", "Finalized"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    batch_code = models.CharField(max_length=50, unique=True)

    payout_date = models.DateField(default=timezone.now)

    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="commission_payout_batches",
    )

    reference_no = models.CharField(max_length=80, blank=True, default="")

    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commission_payout_batches",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    notes = models.TextField(blank=True, default="")

    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.batch_code = (self.batch_code or "").strip()
        self.reference_no = (self.reference_no or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch_code} ({self.status})"



class CommissionPayoutLine(models.Model):
    payout_batch = models.ForeignKey(
        CommissionPayoutBatch,
        on_delete=models.CASCADE,
        related_name="lines",
    )

    commission = models.OneToOneField(
        "commissions.Commission",
        on_delete=models.PROTECT,
        related_name="payout_line",
    )

    partner = models.ForeignKey(settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commission_payout_lines",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "subscriptions_commissionpayoutline"

        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name="commission_payout_line_amount_non_negative",
            )
        ]

    def __str__(self):
        return f"Batch {self.payout_batch_id} → Commission {self.commission_id}"


# =====================================================
# CUSTOMER REFERRAL
# =====================================================


