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
from subscriptions.models import Customer, Emi, FulfillmentStatus, Payment, Product, Subscription

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def _default_branch():
    try:
        from branch_control.services.branch_service import default_branch_for_model

        return default_branch_for_model()
    except Exception:
        return None


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


class BillingInvoiceType(models.TextChoices):
    INVOICE = "INVOICE", "Invoice"
    PROFORMA = "PROFORMA", "Proforma"
    DEMAND_NOTE = "DEMAND_NOTE", "Demand Note"


class ReceiptType(models.TextChoices):
    RETAIL_RECEIPT = "RETAIL_RECEIPT", "Retail Receipt"
    EMI_PAYMENT_RECEIPT = "EMI_PAYMENT_RECEIPT", "EMI Payment Receipt"


class BillingActivationState(models.TextChoices):
    PENDING_DELIVERY = "PENDING_DELIVERY", "Pending Delivery"
    READY = "READY", "Ready"
    ACTIVE = "ACTIVE", "Active"
    RETURN_HOLD = "RETURN_HOLD", "Return Hold"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class BillingSyncEventStatus(models.TextChoices):
    SYNCED = "SYNCED", "Synced"
    SKIPPED = "SKIPPED", "Skipped"
    FAILED = "FAILED", "Failed"


class BillingSourceType(models.TextChoices):
    MANUAL = "MANUAL", "Manual"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    SUBSCRIPTION = "SUBSCRIPTION", "Subscription"
    DELIVERY = "DELIVERY", "Delivery"
    PAYMENT = "PAYMENT", "Payment"
    NOTE_ADJUSTMENT = "NOTE_ADJUSTMENT", "Note Adjustment"


class DirectSaleStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    CONFIRMED = "CONFIRMED", "Confirmed"
    DELIVERED = "DELIVERED", "Delivered"
    INVOICED = "INVOICED", "Invoiced"
    CANCELLED = "CANCELLED", "Cancelled"
    # Additive lifecycle states for post-invoice reversal/archive workflows.
    CANCELLED_PRE_INVOICE = "CANCELLED_PRE_INVOICE", "Cancelled (Pre-invoice)"
    CANCELLED_AFTER_DELIVERY = "CANCELLED_AFTER_DELIVERY", "Cancelled (After delivery)"
    REVERSED_POST_INVOICE = "REVERSED_POST_INVOICE", "Reversed (Post-invoice)"
    RETURNED = "RETURNED", "Returned"
    EXCHANGED_CLOSED = "EXCHANGED_CLOSED", "Exchange closed"
    ARCHIVED = "ARCHIVED", "Archived"


class DirectSale(BillingTimeStampedModel):
    class CustomerGstType(models.TextChoices):
        UNREGISTERED_CONSUMER = "UNREGISTERED_CONSUMER", "Unregistered Consumer"
        REGISTERED_BUSINESS = "REGISTERED_BUSINESS", "Registered Business"

    class TaxCalculationMode(models.TextChoices):
        NON_GST = "NON_GST", "Non-GST"
        GST_INCLUSIVE = "GST_INCLUSIVE", "GST Inclusive"
        GST_EXCLUSIVE = "GST_EXCLUSIVE", "GST Exclusive"

    sale_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    sale_date = models.DateField(db_index=True)
    financial_year = models.CharField(max_length=9, db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="direct_sales",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sales",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sales",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sales",
    )
    status = models.CharField(
        max_length=32,
        choices=DirectSaleStatus.choices,
        default=DirectSaleStatus.DRAFT,
        db_index=True,
    )
    tax_mode = models.CharField(
        max_length=10,
        choices=BillingTaxMode.choices,
        default=BillingTaxMode.NON_GST,
        db_index=True,
    )
    tax_calculation_mode = models.CharField(
        max_length=20,
        choices=TaxCalculationMode.choices,
        default=TaxCalculationMode.NON_GST,
        db_index=True,
    )
    customer_gst_type = models.CharField(
        max_length=32,
        choices=CustomerGstType.choices,
        default=CustomerGstType.UNREGISTERED_CONSUMER,
        db_index=True,
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sales",
    )
    delivery_required = models.BooleanField(default=False, db_index=True)
    delivery_reference = models.CharField(max_length=64, blank=True, default="")
    delivered_at = models.DateTimeField(null=True, blank=True, db_index=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="confirmed_direct_sales",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    invoiced_at = models.DateTimeField(null=True, blank=True, db_index=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    taxable_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    received_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    balance_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    customer_name_snapshot = models.CharField(max_length=160, blank=True, default="")
    customer_phone_snapshot = models.CharField(max_length=20, blank=True, default="")
    customer_snapshot_email = models.EmailField(blank=True, default="")
    customer_snapshot_billing_address_line1 = models.CharField(max_length=255, blank=True, default="")
    customer_snapshot_billing_address_line2 = models.CharField(max_length=255, blank=True, default="")
    customer_snapshot_city = models.CharField(max_length=120, blank=True, default="")
    customer_snapshot_district = models.CharField(max_length=120, blank=True, default="")
    customer_snapshot_state = models.CharField(max_length=120, blank=True, default="")
    customer_snapshot_pincode = models.CharField(max_length=20, blank=True, default="")
    customer_gstin = models.CharField(max_length=20, null=True, blank=True, db_index=True)
    customer_snapshot_place_of_supply = models.CharField(max_length=120, blank=True, default="")
    delivery_snapshot_address_line1 = models.CharField(max_length=255, blank=True, default="")
    delivery_snapshot_address_line2 = models.CharField(max_length=255, blank=True, default="")
    delivery_snapshot_city = models.CharField(max_length=120, blank=True, default="")
    delivery_snapshot_district = models.CharField(max_length=120, blank=True, default="")
    delivery_snapshot_state = models.CharField(max_length=120, blank=True, default="")
    delivery_snapshot_pincode = models.CharField(max_length=20, blank=True, default="")
    idempotency_key = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    idempotency_payload_hash = models.CharField(max_length=64, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "billing_direct_sales"
        ordering = ["-sale_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["sale_date", "status", "customer"]),
            models.Index(fields=["delivery_required", "status"]),
            models.Index(fields=["branch", "sale_date", "status"]),
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
        if not self.customer_id and not (self.customer_name_snapshot or "").strip():
            errors["customer_name_snapshot"] = "Walk-in or customer name is required."
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected cash counter must belong to the same branch."
        if self.finance_account_id:
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
                errors["finance_account"] = "Selected finance account must belong to the sale branch."
        if self.delivery_required and self.status == DirectSaleStatus.DELIVERED and not self.delivered_at:
            errors["delivered_at"] = "Delivered sales must store the delivery timestamp."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                DirectSaleStatus.INVOICED,
                DirectSaleStatus.CANCELLED,
                DirectSaleStatus.CANCELLED_PRE_INVOICE,
                DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
                DirectSaleStatus.REVERSED_POST_INVOICE,
                DirectSaleStatus.RETURNED,
                DirectSaleStatus.EXCHANGED_CLOSED,
                DirectSaleStatus.ARCHIVED,
            },
            allowed={
                (DirectSaleStatus.INVOICED, DirectSaleStatus.REVERSED_POST_INVOICE),
                (DirectSaleStatus.INVOICED, DirectSaleStatus.RETURNED),
                (DirectSaleStatus.INVOICED, DirectSaleStatus.CANCELLED_AFTER_DELIVERY),
                (DirectSaleStatus.INVOICED, DirectSaleStatus.ARCHIVED),
                (DirectSaleStatus.INVOICED, DirectSaleStatus.EXCHANGED_CLOSED),
                (DirectSaleStatus.DELIVERED, DirectSaleStatus.RETURNED),
                (DirectSaleStatus.DELIVERED, DirectSaleStatus.CANCELLED_AFTER_DELIVERY),
                (DirectSaleStatus.DELIVERED, DirectSaleStatus.ARCHIVED),
            },
        )
        self.sale_no = (self.sale_no or "").strip().upper() or None
        self.delivery_reference = (self.delivery_reference or "").strip().upper()
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.customer_phone_snapshot = (self.customer_phone_snapshot or "").strip()
        self.customer_snapshot_email = (self.customer_snapshot_email or "").strip()
        self.customer_snapshot_billing_address_line1 = (self.customer_snapshot_billing_address_line1 or "").strip()
        self.customer_snapshot_billing_address_line2 = (self.customer_snapshot_billing_address_line2 or "").strip()
        self.customer_snapshot_city = (self.customer_snapshot_city or "").strip()
        self.customer_snapshot_district = (self.customer_snapshot_district or "").strip()
        self.customer_snapshot_state = (self.customer_snapshot_state or "").strip()
        self.customer_snapshot_pincode = (self.customer_snapshot_pincode or "").strip()
        self.customer_gstin = (self.customer_gstin or "").strip().upper() or None
        self.customer_snapshot_place_of_supply = (self.customer_snapshot_place_of_supply or "").strip()
        self.delivery_snapshot_address_line1 = (self.delivery_snapshot_address_line1 or "").strip()
        self.delivery_snapshot_address_line2 = (self.delivery_snapshot_address_line2 or "").strip()
        self.delivery_snapshot_city = (self.delivery_snapshot_city or "").strip()
        self.delivery_snapshot_district = (self.delivery_snapshot_district or "").strip()
        self.delivery_snapshot_state = (self.delivery_snapshot_state or "").strip()
        self.delivery_snapshot_pincode = (self.delivery_snapshot_pincode or "").strip()
        self.idempotency_key = (self.idempotency_key or "").strip() or None
        self.idempotency_payload_hash = (self.idempotency_payload_hash or "").strip()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.sale_no or f"SALE-{self.pk}"


class DirectSaleLine(BillingTimeStampedModel):
    direct_sale = models.ForeignKey(
        DirectSale,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="direct_sale_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sale_lines",
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
    product_code_snapshot = models.CharField(max_length=64, blank=True, default="", db_index=True)
    sku_snapshot = models.CharField(max_length=60, blank=True, default="")
    unit_of_measure_snapshot = models.CharField(max_length=30, blank=True, default="")
    hsn_sac_code = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        db_table = "billing_direct_sale_lines"
        ordering = ["id"]

    def clean(self):
        errors = {}
        expected_line_total = Decimal(str(self.taxable_value or MONEY_ZERO)) + Decimal(
            str(self.cgst_amount or MONEY_ZERO)
        ) + Decimal(str(self.sgst_amount or MONEY_ZERO)) + Decimal(str(self.igst_amount or MONEY_ZERO))
        if self.line_total != expected_line_total:
            errors["line_total"] = "Line total must equal taxable value plus GST components."
        if self.inventory_item_id and self.inventory_item.product_id != self.product_id:
            errors["inventory_item"] = "Inventory item must match the selected product."
        if not self.description or not self.description.strip():
            errors["description"] = "Direct sale line description is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        product_code = (getattr(self.product, "product_code", None) or "").strip().upper()
        inventory_sku = (getattr(self.inventory_item, "sku", None) or "").strip().upper()
        product_uom = (getattr(self.product, "unit_of_measure", None) or "PCS").strip().upper()
        inventory_uom = (
            getattr(self.inventory_item, "unit_of_measure", None) or product_uom
        ).strip().upper()
        self.description = (self.description or "").strip()
        self.product_code_snapshot = product_code
        self.sku_snapshot = inventory_sku
        self.unit_of_measure_snapshot = inventory_uom
        self.hsn_sac_code = (self.hsn_sac_code or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)


class BillingInvoice(BillingTimeStampedModel):
    document_no = models.CharField(max_length=40, unique=True, null=True, blank=True, db_index=True)
    invoice_date = models.DateField(db_index=True)
    financial_year = models.CharField(max_length=9, db_index=True)
    document_type = models.CharField(
        max_length=20,
        choices=BillingInvoiceType.choices,
        default=BillingInvoiceType.INVOICE,
        db_index=True,
    )
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
    direct_sale = models.ForeignKey(
        DirectSale,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_invoices",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
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
    source_type = models.CharField(
        max_length=24,
        choices=BillingSourceType.choices,
        default=BillingSourceType.MANUAL,
        db_index=True,
    )
    source_reference = models.CharField(max_length=80, blank=True, default="", db_index=True)
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
            models.Index(fields=["source_type", "invoice_date"]),
            models.Index(fields=["direct_sale", "status"]),
            models.Index(fields=["branch", "invoice_date", "status"]),
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
        if self.direct_sale_id and self.subscription_id:
            errors["subscription"] = "Direct-sale billing documents cannot also link to EMI subscriptions."
        if self.direct_sale_id and self.billing_channel != BillingChannel.RETAIL:
            errors["billing_channel"] = "Direct-sale billing documents must use the retail billing channel."
        if self.direct_sale_id and self.branch_id and self.direct_sale.branch_id and self.branch_id != self.direct_sale.branch_id:
            errors["branch"] = "Invoice branch must match the linked direct sale branch."
        if (
            self.direct_sale_id
            and self.customer_id
            and self.direct_sale.customer_id
            and self.direct_sale.customer_id != self.customer_id
        ):
            errors["customer"] = "Selected customer must match the linked direct sale."
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
        self.document_type = (self.document_type or BillingInvoiceType.INVOICE).strip().upper()
        self.source_reference = (self.source_reference or "").strip()
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.customer_phone_snapshot = (self.customer_phone_snapshot or "").strip()
        self.customer_gstin = (self.customer_gstin or "").strip().upper() or None
        self.place_of_supply_state_code = (self.place_of_supply_state_code or "").strip().upper()
        self.notes = (self.notes or "").strip()
        self.terms = (self.terms or "").strip()
        if self.branch_id is None:
            self.branch = (
                getattr(self.direct_sale, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or getattr(self.subscription, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.document_no or f"INV-{self.pk}"


class BillingProfile(BillingTimeStampedModel):
    subscription = models.OneToOneField(
        Subscription,
        on_delete=models.PROTECT,
        related_name="billing_profile",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="billing_profiles",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="billing_profiles",
    )
    activation_state = models.CharField(
        max_length=24,
        choices=BillingActivationState.choices,
        default=BillingActivationState.PENDING_DELIVERY,
        db_index=True,
    )
    delivery_gate_required = models.BooleanField(default=True, db_index=True)
    delivery_gate_status = models.CharField(max_length=30, blank=True, default="", db_index=True)
    invoice_eligible = models.BooleanField(default=False, db_index=True)
    contract_reference_snapshot = models.CharField(max_length=64, blank=True, default="", db_index=True)
    contract_start_date = models.DateField(db_index=True)
    tenure_months = models.PositiveIntegerField(default=0)
    contract_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    monthly_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    paid_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    waived_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    remaining_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    next_due_date = models.DateField(null=True, blank=True, db_index=True)
    next_due_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    product_code_snapshot = models.CharField(max_length=64, blank=True, default="", db_index=True)
    product_name_snapshot = models.CharField(max_length=160, blank=True, default="")
    activated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_synced_at = models.DateTimeField(default=timezone.now, db_index=True)
    last_synced_event = models.CharField(max_length=60, blank=True, default="", db_index=True)

    class Meta:
        db_table = "billing_profiles"
        ordering = ["-contract_start_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "activation_state"]),
            models.Index(fields=["product", "invoice_eligible"]),
            models.Index(fields=["delivery_gate_status", "invoice_eligible"]),
        ]

    def save(self, *args, **kwargs):
        self.delivery_gate_status = (self.delivery_gate_status or "").strip().upper()
        self.contract_reference_snapshot = (self.contract_reference_snapshot or "").strip().upper()
        self.product_code_snapshot = (self.product_code_snapshot or "").strip().upper()
        self.product_name_snapshot = (self.product_name_snapshot or "").strip()
        self.last_synced_event = (self.last_synced_event or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"BillingProfile#{self.subscription_id}"


class BillingInstallmentMirror(BillingTimeStampedModel):
    billing_profile = models.ForeignKey(
        BillingProfile,
        on_delete=models.CASCADE,
        related_name="installments",
    )
    emi = models.OneToOneField(
        Emi,
        on_delete=models.PROTECT,
        related_name="billing_mirror",
    )
    month_no = models.PositiveIntegerField(db_index=True)
    due_date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    status_snapshot = models.CharField(max_length=20, db_index=True)
    paid_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    waived_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    outstanding_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    payment_count_snapshot = models.PositiveIntegerField(default=0)
    last_payment_date = models.DateField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "billing_installment_mirrors"
        ordering = ["month_no", "id"]
        indexes = [
            models.Index(fields=["billing_profile", "month_no"]),
            models.Index(fields=["status_snapshot", "due_date"]),
        ]

    def save(self, *args, **kwargs):
        self.status_snapshot = (self.status_snapshot or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"BillingInstallmentMirror#{self.emi_id}"


class BillingSyncEvent(BillingTimeStampedModel):
    billing_profile = models.ForeignKey(
        BillingProfile,
        on_delete=models.CASCADE,
        related_name="sync_events",
    )
    source_model = models.CharField(max_length=100, db_index=True)
    source_id = models.CharField(max_length=100, db_index=True)
    event_type = models.CharField(max_length=60, db_index=True)
    status = models.CharField(
        max_length=12,
        choices=BillingSyncEventStatus.choices,
        default=BillingSyncEventStatus.SYNCED,
        db_index=True,
    )
    idempotency_key = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    synced_at = models.DateTimeField(default=timezone.now, db_index=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="billing_sync_events",
    )

    class Meta:
        db_table = "billing_sync_events"
        ordering = ["-synced_at", "-id"]
        indexes = [
            models.Index(fields=["source_model", "source_id", "event_type"]),
            models.Index(fields=["status", "synced_at"]),
        ]

    def save(self, *args, **kwargs):
        self.source_model = (self.source_model or "").strip()
        self.source_id = (self.source_id or "").strip()
        self.event_type = (self.event_type or "").strip().upper()
        self.idempotency_key = (self.idempotency_key or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.source_model}#{self.source_id}::{self.event_type}"


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
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_documents",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="receipt_documents",
    )
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
    direct_sale = models.ForeignKey(
        DirectSale,
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
    source_type = models.CharField(
        max_length=24,
        choices=BillingSourceType.choices,
        default=BillingSourceType.MANUAL,
        db_index=True,
    )
    source_reference = models.CharField(max_length=80, blank=True, default="", db_index=True)
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
            models.Index(fields=["source_type", "receipt_date"]),
            models.Index(fields=["direct_sale", "receipt_date"]),
            models.Index(fields=["branch", "receipt_date", "status"]),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Receipt amount must be greater than zero."
        if self.payment_id and self.receipt_type != ReceiptType.EMI_PAYMENT_RECEIPT:
            errors["receipt_type"] = "Payment-linked receipts must use EMI payment receipt type."
        if (
            self.billing_invoice_id
            and self.direct_sale_id
            and self.billing_invoice.direct_sale_id
            and self.billing_invoice.direct_sale_id != self.direct_sale_id
        ):
            errors["direct_sale"] = "Receipt direct sale must match the linked invoice source."
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected cash counter must belong to the receipt branch."
        if self.status in {BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID} and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted receipts must store a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID},
            allowed={(BillingDocumentStatus.POSTED, BillingDocumentStatus.VOID)},
        )
        self.receipt_no = (self.receipt_no or "").strip().upper() or None
        self.source_reference = (self.source_reference or "").strip()
        self.customer_name_snapshot = (self.customer_name_snapshot or "").strip()
        self.customer_phone_snapshot = (self.customer_phone_snapshot or "").strip()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or getattr(self.payment, "branch", None)
                or getattr(self.direct_sale, "branch", None)
                or getattr(self.billing_invoice, "branch", None)
                or getattr(self.subscription, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.receipt_no or f"RCT-{self.pk}"


class DirectSaleReturnStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class DirectSaleReturnKind(models.TextChoices):
    POST_INVOICE_CANCEL = "POST_INVOICE_CANCEL", "Post-Invoice Cancel"
    DELIVERED_RETURN = "DELIVERED_RETURN", "Delivered Return"
    DELIVERED_EXCHANGE = "DELIVERED_EXCHANGE", "Delivered Exchange"
    DAMAGED_RETURN = "DAMAGED_RETURN", "Damaged Return"
    PARTIAL_RETURN = "PARTIAL_RETURN", "Partial Return"


class ReturnStockDestination(models.TextChoices):
    SELLABLE = "SELLABLE", "Sellable"
    INSPECTION = "INSPECTION", "Inspection"
    DAMAGED = "DAMAGED", "Damaged"
    SERVICE = "SERVICE", "Service"


class RefundMethod(models.TextChoices):
    CASH_REFUND = "CASH_REFUND", "Cash Refund"
    UPI_REFUND = "UPI_REFUND", "UPI Refund"
    BANK_REFUND = "BANK_REFUND", "Bank Refund"


class CustomerRefundStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    PAID = "PAID", "Paid"
    CANCELLED = "CANCELLED", "Cancelled"


class PurchaseReturnStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class DirectSaleReturn(BillingTimeStampedModel):
    return_no = models.CharField(max_length=48, unique=True, db_index=True)
    direct_sale = models.ForeignKey(DirectSale, on_delete=models.PROTECT, related_name="sale_returns")
    original_invoice = models.ForeignKey(BillingInvoice, on_delete=models.PROTECT, related_name="sale_returns")
    credit_note = models.OneToOneField(
        BillingCreditNote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sale_return",
    )
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="direct_sale_returns")
    status = models.CharField(max_length=16, choices=DirectSaleReturnStatus.choices, default=DirectSaleReturnStatus.DRAFT, db_index=True)
    return_kind = models.CharField(
        max_length=24,
        choices=DirectSaleReturnKind.choices,
        default=DirectSaleReturnKind.DELIVERED_RETURN,
        db_index=True,
    )
    stock_destination = models.CharField(
        max_length=16,
        choices=ReturnStockDestination.choices,
        default=ReturnStockDestination.SELLABLE,
        db_index=True,
    )
    stock_location = models.ForeignKey(
        "inventory.StockLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_sale_returns",
    )
    reason = models.TextField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    exchange_amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    exchange_customer_credit = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    stock_effect = models.BooleanField(default=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="approved_direct_sale_returns"
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="posted_direct_sale_returns"
    )
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "billing_direct_sale_returns"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "created_at"]), models.Index(fields=["customer", "created_at"])]


class DirectSaleReturnLine(BillingTimeStampedModel):
    direct_sale_return = models.ForeignKey(DirectSaleReturn, on_delete=models.CASCADE, related_name="lines")
    direct_sale_line = models.ForeignKey(DirectSaleLine, on_delete=models.PROTECT, related_name="return_lines")
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, null=True, blank=True, related_name="direct_sale_return_lines")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "billing_direct_sale_return_lines"
        ordering = ["id"]


class CustomerCreditLedger(BillingTimeStampedModel):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="credit_ledger_entries")
    direct_sale_return = models.ForeignKey(
        DirectSaleReturn, on_delete=models.PROTECT, null=True, blank=True, related_name="credit_ledger_entries"
    )
    credit_note = models.ForeignKey(BillingCreditNote, on_delete=models.PROTECT, null=True, blank=True, related_name="credit_ledger_entries")
    refund = models.ForeignKey("CustomerRefund", on_delete=models.PROTECT, null=True, blank=True, related_name="credit_ledger_entries")
    entry_date = models.DateField(default=timezone.localdate, db_index=True)
    reference_no = models.CharField(max_length=80, blank=True, default="", db_index=True)
    credit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    debit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    notes = models.TextField(blank=True, default="")
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="posted_customer_credit_entries")

    class Meta:
        db_table = "billing_customer_credit_ledger"
        ordering = ["entry_date", "id"]
        indexes = [models.Index(fields=["customer", "entry_date", "id"])]


class CustomerRefund(BillingTimeStampedModel):
    refund_no = models.CharField(max_length=48, unique=True, db_index=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="customer_refunds")
    direct_sale_return = models.ForeignKey(DirectSaleReturn, on_delete=models.PROTECT, null=True, blank=True, related_name="customer_refunds")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    method = models.CharField(max_length=16, choices=RefundMethod.choices)
    finance_account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name="customer_refunds")
    status = models.CharField(max_length=16, choices=CustomerRefundStatus.choices, default=CustomerRefundStatus.DRAFT, db_index=True)
    reason = models.TextField()
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="approved_customer_refunds")
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="paid_customer_refunds")
    paid_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, null=True, blank=True, related_name="customer_refund")

    class Meta:
        db_table = "billing_customer_refunds"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "created_at"]), models.Index(fields=["customer", "created_at"])]


class PurchaseReturn(BillingTimeStampedModel):
    return_no = models.CharField(max_length=48, unique=True, db_index=True)
    purchase_bill = models.ForeignKey("inventory.PurchaseBill", on_delete=models.PROTECT, related_name="purchase_returns")
    vendor = models.ForeignKey("accounting.Vendor", on_delete=models.PROTECT, related_name="purchase_returns")
    status = models.CharField(max_length=16, choices=PurchaseReturnStatus.choices, default=PurchaseReturnStatus.DRAFT, db_index=True)
    return_date = models.DateField(default=timezone.localdate, db_index=True)
    reason = models.TextField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    metadata = models.JSONField(default=dict, blank=True)
    posted_journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, null=True, blank=True, related_name="purchase_return")
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="posted_purchase_returns")
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "billing_purchase_returns"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "return_date"]), models.Index(fields=["vendor", "return_date"])]


class PurchaseReturnLine(BillingTimeStampedModel):
    purchase_return = models.ForeignKey(PurchaseReturn, on_delete=models.CASCADE, related_name="lines")
    purchase_bill_line = models.ForeignKey("inventory.PurchaseBillLine", on_delete=models.PROTECT, related_name="purchase_return_lines")
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="purchase_return_lines")
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "billing_purchase_return_lines"
        ordering = ["id"]
