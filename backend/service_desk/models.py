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
from customers.models import CustomerSupportRequest
from products_core.models import Product
from contracts.models import Subscription
from deliveries.models import SubscriptionDelivery

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def generate_service_case_no() -> str:
    # Include a random suffix: two cases created in the same microsecond would
    # otherwise collide on the unique case_no (wall-clock %f is not unique under
    # rapid creation).
    from django.utils.crypto import get_random_string

    return f"SD-{timezone.now().strftime('%Y%m%d%H%M%S%f')}-{get_random_string(4).upper()}"


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
    DIRECT_SALE_DELIVERY = "DIRECT_SALE_DELIVERY", "Direct Sale Delivery"


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
    payment_exception_approved = models.BooleanField(default=False, db_index=True)
    payment_exception_acknowledged = models.BooleanField(default=False, db_index=True)
    payment_exception_reason = models.TextField(blank=True, default="")
    payment_exception_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_exception_approved_service_desk_cases",
    )
    payment_exception_approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
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
        self.payment_exception_reason = (self.payment_exception_reason or "").strip()
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


# ─────────────────────────────────────────────────────────────────────────────
# WARRANTY & SERVICE TRACKING (Additive - Warranty & Service Policy v2.0)
# ─────────────────────────────────────────────────────────────────────────────

class WarrantyType(models.TextChoices):
    MANUFACTURING = "MANUFACTURING", "Manufacturing Defect (12-24 months)"
    STRUCTURAL = "STRUCTURAL", "Structural (3 years for furniture)"
    EXTENDED = "EXTENDED", "Extended Warranty (optional)"


class DefectClassification(models.TextChoices):
    MANUFACTURING_DEFECT = "MANUFACTURING_DEFECT", "Manufacturing Defect (COVERED)"
    WEAR_TEAR = "WEAR_TEAR", "Wear & Tear (NOT COVERED)"
    USER_DAMAGE = "USER_DAMAGE", "User Damage (NOT COVERED)"
    ENVIRONMENTAL = "ENVIRONMENTAL", "Environmental Damage (LIMITED)"
    UNVERIFIED = "UNVERIFIED", "Unverified (pending assessment)"


class ServiceRemedy(models.TextChoices):
    FREE_REPAIR = "FREE_REPAIR", "Free Repair (warranty)"
    FREE_REPLACEMENT = "FREE_REPLACEMENT", "Free Replacement (warranty)"
    PAID_REPAIR = "PAID_REPAIR", "Paid Repair (out-of-warranty)"
    PAID_REPLACEMENT = "PAID_REPLACEMENT", "Paid Replacement (out-of-warranty)"
    EXTENDED_WARRANTY = "EXTENDED_WARRANTY", "Extended Warranty Enrollment"
    DECLINED = "DECLINED", "Claim Declined"


class WarrantyClaim(ServiceDeskTimeStampedModel):
    """Warranty claim tracking for manufacturing defects and coverage"""

    # Link to service case
    service_case = models.OneToOneField(
        ServiceDeskCase,
        on_delete=models.PROTECT,
        related_name="warranty_claim",
    )

    # Product & subscription info
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="warranty_claims",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="warranty_claims",
    )

    # Warranty details
    warranty_type = models.CharField(
        max_length=20,
        choices=WarrantyType.choices,
        default=WarrantyType.MANUFACTURING,
    )
    warranty_start_date = models.DateField()
    warranty_end_date = models.DateField()
    is_in_warranty = models.BooleanField(default=True, db_index=True)

    # Defect information
    defect_description = models.TextField()
    defect_date_discovered = models.DateField()
    defect_classification = models.CharField(
        max_length=30,
        choices=DefectClassification.choices,
        default=DefectClassification.UNVERIFIED,
        db_index=True,
    )

    # Claim process
    claim_submitted_at = models.DateTimeField(auto_now_add=True, db_index=True)
    claim_status = models.CharField(
        max_length=20,
        choices=[
            ('SUBMITTED', 'Submitted'),
            ('UNDER_ASSESSMENT', 'Under Assessment'),
            ('APPROVED', 'Approved'),
            ('REJECTED', 'Rejected'),
            ('RESOLVED', 'Resolved'),
        ],
        default='SUBMITTED',
        db_index=True,
    )

    # Assessment & verification
    assessment_notes = models.TextField(blank=True, default="")
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_warranty_claims",
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    # Remedy & resolution
    recommended_remedy = models.CharField(
        max_length=30,
        choices=ServiceRemedy.choices,
        default=ServiceRemedy.FREE_REPAIR,
    )
    remedy_cost_labor = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO
    )
    remedy_cost_parts = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO
    )
    remedy_cost_travel = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO
    )
    total_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO
    )

    # Service center details
    authorized_service_center = models.CharField(max_length=160, blank=True, default="")
    service_center_contact = models.CharField(max_length=20, blank=True, default="")

    # Service visit scheduling.
    #
    # These live on the claim rather than on WarrantyServiceCall because the
    # visit being scheduled here has not happened yet. WarrantyServiceCall
    # requires a WarrantyServiceRecord and records a visit that took place,
    # with a cost and technician notes; creating one at scheduling time would
    # mean inventing a service record for work nobody has done, and would make
    # "how many service calls have we performed" wrong.
    scheduled_date = models.DateField(null=True, blank=True, db_index=True)
    preferred_date = models.DateField(
        null=True, blank=True, help_text="Date the customer asked for"
    )
    technician_name = models.CharField(max_length=160, blank=True, default="")
    service_completed_at = models.DateTimeField(null=True, blank=True)

    # Timeline
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_warranty_claims",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "warranty_claims"
        ordering = ["-claim_submitted_at"]
        indexes = [
            models.Index(fields=["product", "is_in_warranty"]),
            models.Index(fields=["claim_status", "claim_submitted_at"]),
            models.Index(fields=["defect_classification"]),
        ]

    def __str__(self):
        return f"WarrantyClaim {self.id} - {self.product.name} ({self.claim_status})"

    @property
    def days_to_report_deadline(self) -> int:
        """Days remaining to report defect (30-day window from discovery)"""
        from datetime import timedelta
        deadline = self.defect_date_discovered + timedelta(days=30)
        remaining = (deadline - timezone.localdate()).days
        return max(0, remaining)

    @property
    def is_claim_eligible(self) -> bool:
        """Check if claim is eligible (within 30-day reporting window)"""
        return self.days_to_report_deadline > 0 and self.is_in_warranty

    def approve_claim(self, approved_by, remedy, cost_labor, cost_parts, cost_travel=0):
        """Approve warranty claim"""
        self.claim_status = 'APPROVED'
        self.recommended_remedy = remedy
        self.remedy_cost_labor = cost_labor
        self.remedy_cost_parts = cost_parts
        self.remedy_cost_travel = cost_travel
        self.total_cost = cost_labor + cost_parts + cost_travel
        self.approved_at = timezone.now()
        self.approved_by = approved_by
        self.save()


class ServicePricing(ServiceDeskTimeStampedModel):
    """Service pricing configuration by product category & service type"""

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="service_pricing",
    )

    # Labor costs
    warranty_labor_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO,
        help_text="Free for warranty; applies to extended warranty"
    )
    out_of_warranty_labor_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("1000"),
        help_text="₹500-2,000 range"
    )

    # Service call charges
    home_service_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=MONEY_ZERO,
        help_text="Free within 5km, ₹500 beyond for warranty"
    )
    travel_charge_beyond_5km = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("500")
    )

    # Service SLA
    home_visit_days = models.PositiveIntegerField(
        default=3,
        help_text="Days for technician home visit (warranty period)"
    )
    service_completion_days = models.PositiveIntegerField(
        default=14,
        help_text="Days to complete repair/replacement"
    )

    class Meta:
        db_table = "service_pricing"
        unique_together = ("product",)

    def __str__(self):
        return f"ServicePricing for {self.product.name}"


class WarrantyExtendedPlan(ServiceDeskTimeStampedModel):
    """Extended warranty plan purchase & enrollment"""

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="warranty_extended_plans",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="extended_warranty_plans",
    )

    # Plan details
    plan_duration_months = models.PositiveIntegerField(
        default=12,
        help_text="Additional months (typically 12, renewable)"
    )
    plan_cost = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="5-10% of product price"
    )
    plan_cost_percentage = models.DecimalField(
        max_digits=4, decimal_places=2,
        help_text="5.00 to 10.00 percent"
    )

    # Enrollment dates
    enrollment_date = models.DateField()
    coverage_start_date = models.DateField()
    coverage_end_date = models.DateField()

    # Payment & status
    payment_status = models.CharField(
        max_length=20,
        choices=[('PENDING', 'Pending'), ('PAID', 'Paid'), ('CANCELLED', 'Cancelled')],
        default='PENDING',
    )
    paid_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "warranty_extended_plans"
        ordering = ["-enrollment_date"]

    def __str__(self):
        return f"ExtendedPlan {self.product.name} ({self.coverage_start_date})"


# ─────────────────────────────────────────────────────────────────────────────
# WARRANTY SERVICE RECORDS (Warranty tracking per Invoice/Delivery)
# ─────────────────────────────────────────────────────────────────────────────

class WarrantyServiceRecord(ServiceDeskTimeStampedModel):
    """Track warranty status and service history per invoice/delivery"""

    from billing.models import BillingInvoice
    from subscriptions.models import SubscriptionDelivery

    # Link to sale/invoice
    invoice = models.OneToOneField(
        BillingInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="warranty_record",
    )
    delivery = models.OneToOneField(
        SubscriptionDelivery,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="warranty_record",
    )

    # Product warranty details
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="warranty_service_records",
    )

    # Warranty period (from delivery date)
    delivery_date = models.DateField(db_index=True)
    warranty_manufacturing_end = models.DateField(db_index=True)
    warranty_structural_end = models.DateField(null=True, blank=True)

    # Warranty status
    is_in_manufacturing_warranty = models.BooleanField(default=True, db_index=True)
    is_in_structural_warranty = models.BooleanField(default=True, db_index=True)
    has_extended_warranty = models.BooleanField(default=False, db_index=True)

    # Service history
    total_service_calls = models.PositiveIntegerField(default=0)
    total_warranty_claims = models.PositiveIntegerField(default=0)
    last_service_date = models.DateField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "warranty_service_records"
        ordering = ["-delivery_date"]
        indexes = [
            models.Index(fields=["product", "is_in_manufacturing_warranty"]),
            models.Index(fields=["delivery_date"]),
            models.Index(fields=["warranty_manufacturing_end"]),
        ]

    def __str__(self):
        return f"WarrantyRecord {self.product.name} (Delivery: {self.delivery_date})"

    @property
    def days_until_manufacturing_warranty_expires(self) -> int:
        """Days remaining in manufacturing warranty"""
        remaining = (self.warranty_manufacturing_end - timezone.localdate()).days
        return max(0, remaining)

    @property
    def days_until_structural_warranty_expires(self) -> int:
        """Days remaining in structural warranty"""
        if not self.warranty_structural_end:
            return 0
        remaining = (self.warranty_structural_end - timezone.localdate()).days
        return max(0, remaining)

    @property
    def warranty_status_display(self) -> str:
        """Human-readable warranty status"""
        if self.is_in_manufacturing_warranty:
            return f"Manufacturing: {self.days_until_manufacturing_warranty_expires} days"
        if self.is_in_structural_warranty:
            return f"Structural: {self.days_until_structural_warranty_expires} days"
        if self.has_extended_warranty:
            return "Extended warranty active"
        return "Out of warranty"

    def update_warranty_status(self):
        """Update warranty status based on current date"""
        today = timezone.localdate()
        self.is_in_manufacturing_warranty = today <= self.warranty_manufacturing_end
        if self.warranty_structural_end:
            self.is_in_structural_warranty = today <= self.warranty_structural_end
        self.save()


class WarrantyServiceCall(ServiceDeskTimeStampedModel):
    """Track individual service calls against warranty records"""

    warranty_record = models.ForeignKey(
        WarrantyServiceRecord,
        on_delete=models.PROTECT,
        related_name="service_calls",
    )
    service_case = models.ForeignKey(
        ServiceDeskCase,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="warranty_service_calls",
    )

    # Service details
    service_call_date = models.DateField(db_index=True)
    service_type = models.CharField(
        max_length=30,
        choices=[
            ('REPAIR', 'Repair'),
            ('REPLACEMENT', 'Replacement'),
            ('MAINTENANCE', 'Maintenance'),
            ('INSPECTION', 'Inspection'),
        ],
        default='REPAIR',
    )

    # Warranty coverage
    is_warranty_covered = models.BooleanField(default=True, db_index=True)
    coverage_type = models.CharField(
        max_length=20,
        choices=[
            ('MANUFACTURING', 'Manufacturing Warranty'),
            ('STRUCTURAL', 'Structural Warranty'),
            ('EXTENDED', 'Extended Warranty'),
            ('PAID', 'Paid Service'),
        ],
        blank=True,
        default='',
    )

    # Cost
    service_cost = models.DecimalField(
        max_digits=10, decimal_places=2,
        default=MONEY_ZERO,
        help_text="Total service cost (0 if warranty covered)"
    )

    # Notes
    technician_notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "warranty_service_calls"
        ordering = ["-service_call_date"]
        indexes = [
            models.Index(fields=["warranty_record", "service_call_date"]),
            models.Index(fields=["is_warranty_covered"]),
        ]

    def __str__(self):
        return f"ServiceCall {self.warranty_record.product.name} ({self.service_call_date})"


from service_desk.support_ticket_models import (  # noqa: E402,F401
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketCategory,
    SupportTicketComment,
    SupportTicketEvent,
    SupportTicketEventType,
    SupportTicketLink,
    SupportTicketLinkType,
    SupportTicketPriority,
    SupportTicketSource,
    SupportTicketStatus,
)
