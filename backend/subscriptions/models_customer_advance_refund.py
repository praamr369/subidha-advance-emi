from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from subscriptions.models import Customer, CustomerAdvance, MONEY_ZERO, PaymentMethod, TimeStampedModel


class CustomerAdvanceRefundStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    VOIDED = "VOIDED", "Voided"
    REVERSED = "REVERSED", "Reversed"


class CustomerAdvanceRefund(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="customer_advance_refunds",
    )
    advance = models.ForeignKey(
        CustomerAdvance,
        on_delete=models.PROTECT,
        related_name="refunds",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="customer_advance_refunds",
    )
    refund_reference_no = models.CharField(max_length=100, db_index=True)
    idempotency_key = models.CharField(max_length=160, blank=True, default="", db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    refund_date = models.DateField(db_index=True)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=CustomerAdvanceRefundStatus.choices,
        default=CustomerAdvanceRefundStatus.ACTIVE,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_customer_advance_refunds",
    )
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="voided_customer_advance_refunds",
    )
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    void_reason = models.TextField(blank=True, default="")
    reversal_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    notes = models.TextField(blank=True, default="")
    metadata_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "customer_advance_refunds"
        ordering = ["-refund_date", "-id"]
        indexes = [
            models.Index(fields=["customer", "refund_date"]),
            models.Index(fields=["advance", "refund_date"]),
            models.Index(fields=["finance_account", "refund_date"]),
            models.Index(fields=["status", "refund_date"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["refund_reference_no"], name="uq_customer_advance_refund_ref"),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uq_customer_advance_refund_idempotency",
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="chk_customer_advance_refund_amount_positive"),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Refund amount must be greater than zero."
        if not self.refund_date:
            errors["refund_date"] = "Refund date is required."
        if not self.refund_reference_no:
            errors["refund_reference_no"] = "Refund reference number is required."
        if self.advance_id and self.customer_id and self.advance.customer_id != self.customer_id:
            errors["customer"] = "Refund customer must match the source customer advance."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected refund finance account must be active."
            if not self.finance_account.chart_account_id:
                errors["finance_account"] = "Selected refund finance account must be mapped to a chart account."
        if self.status in {CustomerAdvanceRefundStatus.VOIDED, CustomerAdvanceRefundStatus.REVERSED} and not self.voided_at:
            errors["voided_at"] = "Voided/reversed refund evidence must include voided_at."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.refund_reference_no = (self.refund_reference_no or "").strip()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip()
        self.notes = (self.notes or "").strip()
        self.void_reason = (self.void_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Customer advance refund {self.refund_reference_no} - {self.amount}"
