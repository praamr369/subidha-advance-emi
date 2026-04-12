from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from billing.models import BillingCreditNote, BillingDebitNote, BillingInvoice, DirectSale
from crm.models import PartyMaster
from inventory.models import InventoryItem
from subscriptions.models import CustomerSupportRequest, Product, Subscription, SubscriptionDelivery

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def generate_service_case_no() -> str:
    return f"SD-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


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


class ServiceDeskTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ServiceDeskCaseType(models.TextChoices):
    COMPLAINT = "COMPLAINT", "Complaint"
    SALES_RETURN = "SALES_RETURN", "Sales Return"
    DELIVERY_RETURN = "DELIVERY_RETURN", "Delivery Return"
    EXCHANGE = "EXCHANGE", "Exchange"
    SERVICE = "SERVICE", "Service"


class ServiceDeskCaseStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    OPEN = "OPEN", "Open"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    AUTHORIZED = "AUTHORIZED", "Authorized"
    IN_SERVICE = "IN_SERVICE", "In Service"
    RESOLVED = "RESOLVED", "Resolved"
    CLOSED = "CLOSED", "Closed"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class ServiceDeskPriority(models.TextChoices):
    LOW = "LOW", "Low"
    NORMAL = "NORMAL", "Normal"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


class ServiceDeskFinanceStatus(models.TextChoices):
    NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
    PENDING = "PENDING", "Pending"
    POSTED = "POSTED", "Posted"


class ServiceDeskStockStatus(models.TextChoices):
    NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
    PENDING = "PENDING", "Pending"
    SETTLED = "SETTLED", "Settled"


class ServiceDeskWarrantyStatus(models.TextChoices):
    UNKNOWN = "UNKNOWN", "Unknown"
    IN_WARRANTY = "IN_WARRANTY", "In Warranty"
    OUT_OF_WARRANTY = "OUT_OF_WARRANTY", "Out Of Warranty"
    GOODWILL = "GOODWILL", "Goodwill"


class ServiceDeskLineDisposition(models.TextChoices):
    RESTOCK = "RESTOCK", "Restock"
    REPAIR = "REPAIR", "Repair"
    REPLACE = "REPLACE", "Replace"
    INSPECT = "INSPECT", "Inspect"
    SCRAP = "SCRAP", "Scrap"


class ServiceDeskCase(ServiceDeskTimeStampedModel):
    case_no = models.CharField(
        max_length=40,
        unique=True,
        default=generate_service_case_no,
        db_index=True,
    )
    case_type = models.CharField(
        max_length=24,
        choices=ServiceDeskCaseType.choices,
        default=ServiceDeskCaseType.COMPLAINT,
        db_index=True,
    )
    status = models.CharField(
        max_length=24,
        choices=ServiceDeskCaseStatus.choices,
        default=ServiceDeskCaseStatus.DRAFT,
        db_index=True,
    )
    priority = models.CharField(
        max_length=12,
        choices=ServiceDeskPriority.choices,
        default=ServiceDeskPriority.NORMAL,
        db_index=True,
    )
    party = models.ForeignKey(
        PartyMaster,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_cases",
    )
    support_request = models.ForeignKey(
        CustomerSupportRequest,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    direct_sale = models.ForeignKey(
        DirectSale,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    delivery = models.ForeignKey(
        SubscriptionDelivery,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    billing_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    credit_note = models.ForeignKey(
        BillingCreditNote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    debit_note = models.ForeignKey(
        BillingDebitNote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    replacement_direct_sale = models.ForeignKey(
        DirectSale,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="replacement_service_desk_cases",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_cases",
    )
    warranty_status = models.CharField(
        max_length=20,
        choices=ServiceDeskWarrantyStatus.choices,
        default=ServiceDeskWarrantyStatus.UNKNOWN,
        db_index=True,
    )
    finance_status = models.CharField(
        max_length=20,
        choices=ServiceDeskFinanceStatus.choices,
        default=ServiceDeskFinanceStatus.NOT_REQUIRED,
        db_index=True,
    )
    stock_status = models.CharField(
        max_length=20,
        choices=ServiceDeskStockStatus.choices,
        default=ServiceDeskStockStatus.NOT_REQUIRED,
        db_index=True,
    )
    credit_note_required = models.BooleanField(default=False, db_index=True)
    debit_note_required = models.BooleanField(default=False, db_index=True)
    stock_resolution_required = models.BooleanField(default=False, db_index=True)
    issue_summary = models.CharField(max_length=200)
    issue_details = models.TextField(blank=True, default="")
    reporter_name_snapshot = models.CharField(max_length=160, blank=True, default="")
    reporter_phone_snapshot = models.CharField(max_length=20, blank=True, default="")
    taxable_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    internal_notes = models.TextField(blank=True, default="")
    resolution_summary = models.TextField(blank=True, default="")
    service_due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    authorized_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assigned_service_desk_cases",
    )
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="authorized_service_desk_cases",
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="resolved_service_desk_cases",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="closed_service_desk_cases",
    )

    class Meta:
        db_table = "service_desk_cases"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["case_type", "status", "created_at"]),
            models.Index(fields=["party", "created_at"]),
            models.Index(fields=["support_request", "created_at"]),
            models.Index(fields=["direct_sale", "created_at"]),
            models.Index(fields=["subscription", "created_at"]),
            models.Index(fields=["delivery", "created_at"]),
            models.Index(fields=["billing_invoice", "created_at"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["finance_status", "stock_status"]),
        ]

    def clean(self):
        errors = {}
        expected_total = Decimal(str(self.taxable_total or MONEY_ZERO)) + Decimal(
            str(self.tax_total or MONEY_ZERO)
        )
        if self.total_amount != expected_total:
            errors["total_amount"] = "Total amount must equal taxable total plus tax total."
        if not self.issue_summary or not self.issue_summary.strip():
            errors["issue_summary"] = "Issue summary is required."
        if self.delivery_id and self.subscription_id and self.delivery.subscription_id != self.subscription_id:
            errors["delivery"] = "Linked delivery must belong to the selected subscription."
        if self.billing_invoice_id and self.subscription_id:
            invoice_subscription_id = getattr(self.billing_invoice, "subscription_id", None)
            if invoice_subscription_id and invoice_subscription_id != self.subscription_id:
                errors["billing_invoice"] = "Linked invoice must belong to the selected subscription."
        if self.billing_invoice_id and self.direct_sale_id:
            invoice_direct_sale_id = getattr(self.billing_invoice, "direct_sale_id", None)
            if invoice_direct_sale_id and invoice_direct_sale_id != self.direct_sale_id:
                errors["billing_invoice"] = "Linked invoice must belong to the selected direct sale."
        if self.support_request_id and self.subscription_id:
            support_subscription_id = getattr(self.support_request, "subscription_id", None)
            if support_subscription_id and support_subscription_id != self.subscription_id:
                errors["support_request"] = "Support request subscription must match the service case subscription."
        if self.inventory_item_id and self.product_id and self.inventory_item.product_id != self.product_id:
            errors["inventory_item"] = "Inventory item must match the selected product."
        if self.credit_note_id and self.billing_invoice_id and self.credit_note.original_invoice_id != self.billing_invoice_id:
            errors["credit_note"] = "Credit note must belong to the linked billing invoice."
        if self.debit_note_id and self.billing_invoice_id and self.debit_note.original_invoice_id != self.billing_invoice_id:
            errors["debit_note"] = "Debit note must belong to the linked billing invoice."
        if self.replacement_direct_sale_id and self.direct_sale_id and self.replacement_direct_sale_id == self.direct_sale_id:
            errors["replacement_direct_sale"] = "Replacement sale cannot be the same as the original direct sale."
        if self.case_type == ServiceDeskCaseType.DELIVERY_RETURN and not self.delivery_id:
            errors["delivery"] = "Delivery return cases must link a delivery record."
        if self.case_type in {
            ServiceDeskCaseType.SALES_RETURN,
            ServiceDeskCaseType.EXCHANGE,
        } and not (self.billing_invoice_id or self.direct_sale_id):
            errors["billing_invoice"] = "Sales return and exchange cases must link a billing invoice or direct sale."
        if self.status == ServiceDeskCaseStatus.RESOLVED and not (self.resolution_summary or "").strip():
            errors["resolution_summary"] = "Resolved cases must store a resolution summary."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                ServiceDeskCaseStatus.CLOSED,
                ServiceDeskCaseStatus.CANCELLED,
            },
        )
        self.case_no = (self.case_no or generate_service_case_no()).strip().upper()
        self.issue_summary = (self.issue_summary or "").strip()
        self.issue_details = (self.issue_details or "").strip()
        self.reporter_name_snapshot = (self.reporter_name_snapshot or "").strip()
        self.reporter_phone_snapshot = (self.reporter_phone_snapshot or "").strip()
        self.internal_notes = (self.internal_notes or "").strip()
        self.resolution_summary = (self.resolution_summary or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.case_no


class ServiceDeskCaseLine(ServiceDeskTimeStampedModel):
    service_case = models.ForeignKey(
        ServiceDeskCase,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_case_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_desk_case_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=Decimal("1.000"),
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    disposition = models.CharField(
        max_length=20,
        choices=ServiceDeskLineDisposition.choices,
        default=ServiceDeskLineDisposition.INSPECT,
        db_index=True,
    )
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "service_desk_case_lines"
        ordering = ["id"]

    def clean(self):
        errors = {}
        expected_total = Decimal(str(self.taxable_amount or MONEY_ZERO)) + Decimal(
            str(self.tax_amount or MONEY_ZERO)
        )
        if self.line_total != expected_total:
            errors["line_total"] = "Line total must equal taxable amount plus tax amount."
        if self.inventory_item_id and self.product_id and self.inventory_item.product_id != self.product_id:
            errors["inventory_item"] = "Inventory item must match the selected product."
        if not self.description or not self.description.strip():
            errors["description"] = "Line description is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

