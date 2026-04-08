from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from accounting.models import DocumentSequence, FinanceAccount, JournalEntry
from inventory.models import InventoryItem
from subscriptions.models import Customer, Payment, Product, Subscription

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def _status_transition_blocked(previous_status: str | None, next_status: str | None, *, allowed: set[tuple[str, str]]) -> bool:
    if previous_status is None:
        return False
    if previous_status == next_status:
        return False
    return (previous_status, next_status) not in allowed


def _immutable_status_guard(instance, *, immutable_statuses: set[str], allowed: set[tuple[str, str]] | None = None):
    if not instance.pk:
        return
    existing = instance.__class__.objects.filter(pk=instance.pk).only("status").first()
    if existing is None or existing.status not in immutable_statuses:
        return
    if _status_transition_blocked(existing.status, getattr(instance, "status", None), allowed=allowed or set()):
        raise ValidationError({"status": f"{instance.__class__.__name__} is immutable once it reaches {existing.status}."})


class BillingTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BillingChannel(models.TextChoices):
    RETAIL = "RETAIL", "Retail"
    EMI = "EMI", "EMI"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"
    OTHER = "OTHER", "Other"


class BillingTaxMode(models.TextChoices):
    GST = "GST", "GST"
    NON_GST = "NON_GST", "Non-GST"


class BillingDocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"
    VOID = "VOID", "Void"


class ReceiptType(models.TextChoices):
    RETAIL_RECEIPT = "RETAIL_RECEIPT", "Retail Receipt"
    EMI_PAYMENT_RECEIPT = "EMI_PAYMENT_RECEIPT", "EMI Payment Receipt"


class BillingInvoice(BillingTimeStampedModel):
    document_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    invoice_date = models.DateField(db_index=True)
    financial_year = models.CharField(max_length=9, db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="billing_invoices",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoices",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoices",
    )
    billing_channel = models.CharField(
        max_length=20,
        choices=BillingChannel.choices,
        default=BillingChannel.RETAIL,
        db_index=True,
    )
    tax_mode = models.CharField(
        max_length=10,
        choices=BillingTaxMode.choices,
        default=BillingTaxMode.NON_GST,
        db_index=True,
    )
    status = models.CharField(
        max_length=12,
        choices=BillingDocumentStatus.choices,
        default=BillingDocumentStatus.DRAFT,
        db_index=True,
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoices",
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    taxable_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    received_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    balance_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    place_of_supply_state_code = models.CharField(max_length=5, blank=True, default="")
    customer_name_snapshot = models.CharField(max_length=160, blank=True, default="")
    customer_phone_snapshot = models.CharField(max_length=20, blank=True, default="")
    customer_gstin = models.CharField(max_length=20, null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, default="")
    terms = models.TextField(blank=True, default="")
    printed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    printed_count = models.PositiveIntegerField(default=0)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_billing_invoices",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoice",
    )

    class Meta:
        db_table = "billing_invoices"
        ordering = ["-invoice_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["invoice_date", "status", "customer"]),
            models.Index(fields=["billing_channel", "status"]),
        ]

    def clean(self):
        errors = {}
        computed_balance = Decimal(str(self.grand_total or MONEY_ZERO)) - Decimal(
            str(self.received_total or MONEY_ZERO)
        )
        if computed_balance < MONEY_ZERO:
            errors["received_total"] = "Received total cannot exceed grand total."
        elif self.balance_total != computed_balance:
            errors["balance_total"] = "Balance total must equal grand total minus received total."
        if self.subscription_id and self.customer_id and self.subscription.customer_id != self.customer_id:
            errors["customer"] = "Selected customer must match the linked subscription."
        if self.status in {BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID} and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted invoices must store the accounting journal."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                BillingDocumentStatus.APPROVED,
                BillingDocumentStatus.POSTED,
                BillingDocumentStatus.CANCELLED,
                BillingDocumentStatus.VOID,
            },
            allowed={
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED),
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.CANCELLED),
                (BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID),
            },
        )
        self.document_no = (self.document_no or "").strip().upper() or None
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.customer_phone_snapshot = (self.customer_phone_snapshot or "").strip()
        self.customer_gstin = (self.customer_gstin or "").strip().upper() or None
        self.place_of_supply_state_code = (self.place_of_supply_state_code or "").strip().upper()
        self.notes = (self.notes or "").strip()
        self.terms = (self.terms or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.document_no or f"INV-{self.pk}"


class BillingInvoiceLine(BillingTimeStampedModel):
    invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoice_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoice_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    hsn_sac_code = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        db_table = "billing_invoice_lines"
        ordering = ["id"]

    def clean(self):
        errors = {}
        expected_line_total = Decimal(str(self.taxable_value or MONEY_ZERO)) + Decimal(
            str(self.cgst_amount or MONEY_ZERO)
        ) + Decimal(str(self.sgst_amount or MONEY_ZERO)) + Decimal(str(self.igst_amount or MONEY_ZERO))
        if self.line_total != expected_line_total:
            errors["line_total"] = "Line total must equal taxable value plus GST components."
        if not self.description or not self.description.strip():
            errors["description"] = "Invoice line description is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.hsn_sac_code = (self.hsn_sac_code or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)


class BillingCreditNote(BillingTimeStampedModel):
    note_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    note_date = models.DateField(db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="billing_credit_notes",
    )
    original_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        related_name="credit_notes",
    )
    reason = models.TextField(blank=True, default="")
    stock_effect = models.BooleanField(default=False, db_index=True)
    taxable_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    status = models.CharField(
        max_length=12,
        choices=BillingDocumentStatus.choices,
        default=BillingDocumentStatus.DRAFT,
        db_index=True,
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_credit_note",
    )

    class Meta:
        db_table = "billing_credit_notes"
        ordering = ["-note_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "note_date"]),
        ]

    def clean(self):
        expected_total = Decimal(str(self.taxable_adjustment or MONEY_ZERO)) + Decimal(
            str(self.tax_adjustment or MONEY_ZERO)
        )
        if self.total_adjustment != expected_total:
            raise ValidationError({"total_adjustment": "Total adjustment must equal taxable plus tax adjustment."})

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                BillingDocumentStatus.APPROVED,
                BillingDocumentStatus.POSTED,
                BillingDocumentStatus.CANCELLED,
                BillingDocumentStatus.VOID,
            },
            allowed={
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED),
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.CANCELLED),
                (BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID),
            },
        )
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class BillingCreditNoteLine(BillingTimeStampedModel):
    credit_note = models.ForeignKey(
        BillingCreditNote,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="credit_note_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "billing_credit_note_lines"
        ordering = ["id"]

    def clean(self):
        if self.line_total != Decimal(str(self.taxable_value or MONEY_ZERO)) + Decimal(
            str(self.tax_amount or MONEY_ZERO)
        ):
            raise ValidationError({"line_total": "Line total must equal taxable value plus tax amount."})

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class BillingDebitNote(BillingTimeStampedModel):
    note_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    note_date = models.DateField(db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="billing_debit_notes",
    )
    original_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        related_name="debit_notes",
    )
    reason = models.TextField(blank=True, default="")
    stock_effect = models.BooleanField(default=False, db_index=True)
    taxable_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    status = models.CharField(
        max_length=12,
        choices=BillingDocumentStatus.choices,
        default=BillingDocumentStatus.DRAFT,
        db_index=True,
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_debit_note",
    )

    class Meta:
        db_table = "billing_debit_notes"
        ordering = ["-note_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "note_date"]),
        ]

    def clean(self):
        expected_total = Decimal(str(self.taxable_adjustment or MONEY_ZERO)) + Decimal(
            str(self.tax_adjustment or MONEY_ZERO)
        )
        if self.total_adjustment != expected_total:
            raise ValidationError({"total_adjustment": "Total adjustment must equal taxable plus tax adjustment."})

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                BillingDocumentStatus.APPROVED,
                BillingDocumentStatus.POSTED,
                BillingDocumentStatus.CANCELLED,
                BillingDocumentStatus.VOID,
            },
            allowed={
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED),
                (BillingDocumentStatus.APPROVED, BillingDocumentStatus.CANCELLED),
                (BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID),
            },
        )
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class BillingDebitNoteLine(BillingTimeStampedModel):
    debit_note = models.ForeignKey(
        BillingDebitNote,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="debit_note_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "billing_debit_note_lines"
        ordering = ["id"]

    def clean(self):
        if self.line_total != Decimal(str(self.taxable_value or MONEY_ZERO)) + Decimal(
            str(self.tax_amount or MONEY_ZERO)
        ):
            raise ValidationError({"line_total": "Line total must equal taxable value plus tax amount."})

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ReceiptDocument(BillingTimeStampedModel):
    receipt_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    receipt_type = models.CharField(
        max_length=30,
        choices=ReceiptType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=12,
        choices=BillingDocumentStatus.choices,
        default=BillingDocumentStatus.DRAFT,
        db_index=True,
    )
    receipt_date = models.DateField(db_index=True)
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_documents",
    )
    billing_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipts",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_documents",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_documents",
    )
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_document",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(MONEY_ZERO)])
    customer_name_snapshot = models.CharField(max_length=160, blank=True, default="")
    customer_phone_snapshot = models.CharField(max_length=20, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_document",
    )
    printed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    printed_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "billing_receipt_documents"
        ordering = ["-receipt_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["receipt_type", "receipt_date"]),
            models.Index(fields=["status", "receipt_date"]),
        ]

    def clean(self):
        if self.amount is None or self.amount <= MONEY_ZERO:
            raise ValidationError({"amount": "Receipt amount must be greater than zero."})
        if self.payment_id and self.receipt_type != ReceiptType.EMI_PAYMENT_RECEIPT:
            raise ValidationError({"receipt_type": "Payment-linked receipts must use EMI payment receipt type."})
        if self.status in {BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID} and not self.posted_journal_entry_id:
            raise ValidationError({"posted_journal_entry": "Posted receipts must store a journal entry."})

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID},
            allowed={(BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID)},
        )
        self.receipt_no = (self.receipt_no or "").strip().upper() or None
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.customer_phone_snapshot = (self.customer_phone_snapshot or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.receipt_no or f"RCT-{self.pk}"
