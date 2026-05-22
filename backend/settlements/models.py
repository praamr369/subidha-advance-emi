from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from settlements.services.settlement_number_service import (
    generate_bank_statement_import_no,
    generate_cashier_day_close_no,
    generate_upi_settlement_import_no,
)

MONEY_ZERO = Decimal("0.00")


def bank_statement_upload_to(instance, filename: str) -> str:
    return f"settlements/bank_statements/{timezone.now().strftime('%Y/%m')}/{filename}"


def upi_settlement_upload_to(instance, filename: str) -> str:
    return f"settlements/upi_settlements/{timezone.now().strftime('%Y/%m')}/{filename}"


class SettlementTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ImportStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    UPLOADED = "UPLOADED", "Uploaded"
    PARSED = "PARSED", "Parsed"
    PARTIALLY_MATCHED = "PARTIALLY_MATCHED", "Partially Matched"
    MATCHED = "MATCHED", "Matched"
    VOIDED = "VOIDED", "Voided"
    FAILED = "FAILED", "Failed"


class LineMatchedStatus(models.TextChoices):
    UNMATCHED = "UNMATCHED", "Unmatched"
    PARTIAL = "PARTIAL", "Partial"
    MATCHED = "MATCHED", "Matched"
    IGNORED = "IGNORED", "Ignored"
    NEEDS_REVIEW = "NEEDS_REVIEW", "Needs Review"


class CashierDayCloseStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    VOIDED = "VOIDED", "Voided"


class SettlementAllocationSourceType(models.TextChoices):
    BANK_STATEMENT_LINE = "BANK_STATEMENT_LINE", "Bank Statement Line"
    UPI_SETTLEMENT_LINE = "UPI_SETTLEMENT_LINE", "UPI Settlement Line"
    CASHIER_DAY_CLOSE = "CASHIER_DAY_CLOSE", "Cashier Day Close"


class SettlementAllocationStatus(models.TextChoices):
    PROPOSED = "PROPOSED", "Proposed"
    MATCHED = "MATCHED", "Matched"
    PARTIAL = "PARTIAL", "Partial"
    REJECTED = "REJECTED", "Rejected"
    VOIDED = "VOIDED", "Voided"


class BankStatementImport(SettlementTimeStampedModel):
    import_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_bank_statement_import_no,
    )
    bank_finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="bank_statement_imports",
    )
    statement_period_from = models.DateField(db_index=True)
    statement_period_to = models.DateField(db_index=True)
    uploaded_file = models.FileField(
        upload_to=bank_statement_upload_to,
        null=True,
        blank=True,
        max_length=500,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="uploaded_bank_statement_imports",
    )
    uploaded_at = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(
        max_length=24,
        choices=ImportStatus.choices,
        default=ImportStatus.DRAFT,
        db_index=True,
    )
    checksum = models.CharField(max_length=64, blank=True, default="", db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_bank_statement_imports"
        ordering = ["-uploaded_at", "-id"]
        indexes = [
            models.Index(fields=["bank_finance_account", "statement_period_from", "statement_period_to"]),
            models.Index(fields=["status", "uploaded_at"]),
            models.Index(fields=["checksum"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(statement_period_to__gte=models.F("statement_period_from")),
                name="settlements_bank_statement_period_order",
            ),
        ]

    def clean(self):
        errors = {}
        if self.statement_period_from and self.statement_period_to and self.statement_period_to < self.statement_period_from:
            errors["statement_period_to"] = "Statement period end cannot be earlier than start."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.import_no = (self.import_no or generate_bank_statement_import_no()).strip().upper()
        self.checksum = (self.checksum or "").strip().lower()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.import_no


class BankStatementLine(SettlementTimeStampedModel):
    statement_import = models.ForeignKey(
        BankStatementImport,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    transaction_date = models.DateField(db_index=True)
    value_date = models.DateField(null=True, blank=True, db_index=True)
    description = models.TextField()
    reference_no = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    normalized_reference = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    matched_status = models.CharField(
        max_length=16,
        choices=LineMatchedStatus.choices,
        default=LineMatchedStatus.UNMATCHED,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_bank_statement_lines"
        ordering = ["transaction_date", "id"]
        indexes = [
            models.Index(fields=["statement_import", "transaction_date"]),
            models.Index(fields=["matched_status", "transaction_date"]),
            models.Index(fields=["reference_no"]),
            models.Index(fields=["normalized_reference"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(debit__gte=0) & Q(credit__gte=0),
                name="settlements_bank_line_non_negative_amounts",
            ),
            models.CheckConstraint(
                condition=~(Q(debit__gt=0) & Q(credit__gt=0)),
                name="settlements_bank_line_no_dual_sign",
            ),
        ]

    def clean(self):
        errors = {}
        if (self.debit or MONEY_ZERO) > MONEY_ZERO and (self.credit or MONEY_ZERO) > MONEY_ZERO:
            errors["debit"] = "Bank statement lines cannot have both debit and credit amounts."
            errors["credit"] = "Bank statement lines cannot have both debit and credit amounts."
        if (self.debit or MONEY_ZERO) < MONEY_ZERO:
            errors["debit"] = "Debit cannot be negative."
        if (self.credit or MONEY_ZERO) < MONEY_ZERO:
            errors["credit"] = "Credit cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.normalized_reference = (self.normalized_reference or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"BankLine#{self.pk} ({self.transaction_date})"


class UpiSettlementImport(SettlementTimeStampedModel):
    import_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_upi_settlement_import_no,
    )
    upi_finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="upi_settlement_imports",
    )
    settlement_date = models.DateField(db_index=True)
    uploaded_file = models.FileField(
        upload_to=upi_settlement_upload_to,
        null=True,
        blank=True,
        max_length=500,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="uploaded_upi_settlement_imports",
    )
    uploaded_at = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(
        max_length=24,
        choices=ImportStatus.choices,
        default=ImportStatus.DRAFT,
        db_index=True,
    )
    checksum = models.CharField(max_length=64, blank=True, default="", db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_upi_settlement_imports"
        ordering = ["-uploaded_at", "-id"]
        indexes = [
            models.Index(fields=["upi_finance_account", "settlement_date"]),
            models.Index(fields=["status", "uploaded_at"]),
            models.Index(fields=["checksum"]),
        ]

    def save(self, *args, **kwargs):
        self.import_no = (self.import_no or generate_upi_settlement_import_no()).strip().upper()
        self.checksum = (self.checksum or "").strip().lower()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.import_no


class UpiSettlementLine(SettlementTimeStampedModel):
    settlement_import = models.ForeignKey(
        UpiSettlementImport,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    transaction_ref = models.CharField(max_length=120, db_index=True)
    payment_ref = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    gross_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    fee_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    net_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    settlement_date = models.DateField(db_index=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    matched_status = models.CharField(
        max_length=16,
        choices=LineMatchedStatus.choices,
        default=LineMatchedStatus.UNMATCHED,
        db_index=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_upi_settlement_lines"
        ordering = ["settlement_date", "id"]
        indexes = [
            models.Index(fields=["settlement_import", "settlement_date"]),
            models.Index(fields=["matched_status", "settlement_date"]),
            models.Index(fields=["transaction_ref"]),
            models.Index(fields=["payment_ref"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(gross_amount__gte=0) & Q(fee_amount__gte=0) & Q(net_amount__gte=0),
                name="settlements_upi_line_non_negative_amounts",
            ),
        ]

    def save(self, *args, **kwargs):
        self.transaction_ref = (self.transaction_ref or "").strip()
        self.payment_ref = (self.payment_ref or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"UpiLine#{self.pk} ({self.settlement_date})"


class CashierDayClose(SettlementTimeStampedModel):
    close_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_cashier_day_close_no,
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cashier_day_closes",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cashier_day_closes",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cashier_day_closes",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cashier_day_closes",
    )
    business_date = models.DateField(db_index=True)
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    system_cash_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    counted_cash = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    variance = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    status = models.CharField(
        max_length=12,
        choices=CashierDayCloseStatus.choices,
        default=CashierDayCloseStatus.DRAFT,
        db_index=True,
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="closed_cashier_day_closes",
    )
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_cashier_day_closes",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_cashier_day_closes"
        ordering = ["-business_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["cashier", "business_date", "status"]),
            models.Index(fields=["branch", "business_date", "status"]),
            models.Index(fields=["cash_counter", "business_date", "status"]),
            models.Index(fields=["finance_account", "business_date", "status"]),
        ]

    def clean(self):
        errors = {}
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected cash counter must belong to the same branch."
        if self.finance_account_id and self.branch_id:
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if finance_branch_id and finance_branch_id != self.branch_id:
                errors["finance_account"] = "Selected finance account must belong to the same branch."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.close_no = (self.close_no or generate_cashier_day_close_no()).strip().upper()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.close_no


class SettlementAllocation(SettlementTimeStampedModel):
    source_type = models.CharField(
        max_length=30,
        choices=SettlementAllocationSourceType.choices,
        db_index=True,
    )
    source_id = models.CharField(max_length=64, db_index=True)
    payment = models.ForeignKey(
        "subscriptions.Payment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="settlement_allocations",
    )
    receipt = models.ForeignKey(
        "billing.ReceiptDocument",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="settlement_allocations",
    )
    money_movement = models.ForeignKey(
        "accounting.MoneyMovement",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="settlement_allocations",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="settlement_allocations",
    )
    matched_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=12,
        choices=SettlementAllocationStatus.choices,
        default=SettlementAllocationStatus.PROPOSED,
        db_index=True,
    )
    matched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="matched_settlement_allocations",
    )
    matched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    confidence = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "settlements_settlement_allocations"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["source_type", "source_id"]),
            models.Index(fields=["payment"]),
            models.Index(fields=["receipt"]),
            models.Index(fields=["money_movement"]),
            models.Index(fields=["finance_account"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(matched_amount__gt=0),
                name="settlements_allocation_matched_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(payment__isnull=False) | Q(receipt__isnull=False) | Q(money_movement__isnull=False),
                name="settlements_allocation_requires_target",
            ),
        ]

    def clean(self):
        errors = {}
        if not (self.payment_id or self.receipt_id or self.money_movement_id):
            errors["payment"] = "Allocation must reference at least one internal target (payment, receipt, or money movement)."
        if (self.matched_amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["matched_amount"] = "Matched amount must be greater than zero."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.source_type = (self.source_type or "").strip().upper()
        self.source_id = (self.source_id or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.source_type}#{self.source_id} -> {self.matched_amount}"
