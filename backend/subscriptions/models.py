from decimal import Decimal, ROUND_HALF_UP
import hashlib
from pathlib import Path
from uuid import uuid4
from xml.parsers.expat import errors

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils.text import slugify
from django.utils import timezone


MONEY_ZERO = Decimal("0.00")


def _default_branch():
    try:
        from branch_control.services.branch_service import default_branch_for_model

        return default_branch_for_model()
    except Exception:
        return None
HUNDRED = Decimal("100.00")


def _normalize_product_image_identity(value: str | None, *, fallback: str) -> str:
    normalized = slugify((value or "").strip())
    return normalized or fallback


def product_image_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".img"

    product_code = (getattr(instance, "product_code", "") or "").strip()
    if product_code:
        identity_seed = product_code
        fallback_identity = "product"
    else:
        product_pk = getattr(instance, "pk", None)
        identity_seed = f"product-{product_pk}" if product_pk else "product"
        fallback_identity = identity_seed

    identity = _normalize_product_image_identity(
        identity_seed,
        fallback=fallback_identity,
    )
    token = uuid4().hex[:10]
    return f"products/{identity}/{identity}-{token}{extension}"

def subscription_document_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".bin"

    subscription_id = getattr(instance, "subscription_id", None)
    doc_type = (getattr(instance, "document_type", "") or "DOC").strip().lower()
    token = uuid4().hex[:12]
    identity = f"sub-{subscription_id}" if subscription_id else "subscription"
    return f"subscriptions/{identity}/{doc_type}-{token}{extension}"


# =====================================================
# ENUMS
# =====================================================

class PlanType(models.TextChoices):
    EMI = "EMI", "EMI"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"


class PublicLeadStatus(models.TextChoices):
    NEW = "NEW", "New"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    CONTACTED = "CONTACTED", "Contacted"
    CONVERTED = "CONVERTED", "Converted"
    CLOSED = "CLOSED", "Closed"


class PublicLeadIntent(models.TextChoices):
    GENERAL = "GENERAL", "General"
    QUOTATION = "QUOTATION", "Quotation"
    ESTIMATE = "ESTIMATE", "Estimate"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    SUBSCRIPTION = "SUBSCRIPTION", "Subscription"


class SupportRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    CLOSED = "CLOSED", "Closed"


class SupportRequestCategory(models.TextChoices):
    PAYMENT_ISSUE = "PAYMENT_ISSUE", "Payment Issue"
    RECEIPT_ISSUE = "RECEIPT_ISSUE", "Receipt Issue"
    EMI_ISSUE = "EMI_ISSUE", "EMI Issue"
    SUBSCRIPTION_QUERY = "SUBSCRIPTION_QUERY", "Subscription Query"
    DRAW_QUERY = "DRAW_QUERY", "Draw Query"
    OTHER = "OTHER", "Other"


class SubscriptionRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class FulfillmentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    DELIVERED = "DELIVERED", "Delivered"
    RETURN_REQUESTED = "RETURN_REQUESTED", "Return Requested"
    RETURNED = "RETURNED", "Returned"


class DeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SCHEDULED = "SCHEDULED", "Scheduled"
    DISPATCHED = "DISPATCHED", "Dispatched"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Out for Delivery"
    DELIVERED = "DELIVERED", "Delivered"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"
    RETURN_REQUESTED = "RETURN_REQUESTED", "Return Requested"
    RETURNED = "RETURNED", "Returned"


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
    SETTLED = "SETTLED", "Settled"
    REVERSED = "REVERSED", "Reversed"

class ContractReturnConditionStatus(models.TextChoices):
    NOT_ASSESSED = "NOT_ASSESSED", "Not Assessed"
    GOOD = "GOOD", "Good"
    FAIR = "FAIR", "Fair"
    DAMAGED = "DAMAGED", "Damaged"


class ContractRefundStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PARTIAL = "PARTIAL", "Partial"
    REFUNDED = "REFUNDED", "Refunded"
    WITHHELD = "WITHHELD", "Withheld"


class SubscriptionDocumentType(models.TextChoices):
    CUSTOMER_KYC_ID = "CUSTOMER_KYC_ID", "Customer KYC ID"
    CUSTOMER_SIGNATURE = "CUSTOMER_SIGNATURE", "Customer Signature"
    RENT_CONTRACT_PDF = "RENT_CONTRACT_PDF", "Rent Contract PDF"
    LEASE_CONTRACT_PDF = "LEASE_CONTRACT_PDF", "Lease Contract PDF"


class DocumentVerificationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VERIFIED = "VERIFIED", "Verified"
    REJECTED = "REJECTED", "Rejected"



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
    kyc_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="kyc_reviewed_customers",
        null=True,
        blank=True,
    )
    kyc_reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    kyc_rejection_reason = models.TextField(blank=True, default="") 
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    class Meta:
        db_table = "customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["kyc_status"]),
            models.Index(fields=["name"]),
            models.Index(fields=["kyc_reviewed_at"]),
            models.Index(fields=["city"]),
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


class ProductCategoryMaster(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "product_category_master"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["is_active", "name"]),
        ]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ProductSubcategoryMaster(TimeStampedModel):
    category = models.ForeignKey(
        ProductCategoryMaster,
        on_delete=models.PROTECT,
        related_name="subcategories",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "product_subcategory_master"
        ordering = ["category__name", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "name"],
                name="uq_product_subcategory_per_category",
            ),
        ]
        indexes = [
            models.Index(fields=["category", "is_active", "name"]),
        ]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class ProductUnitOfMeasureMaster(TimeStampedModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "product_unit_of_measure_master"
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["is_active", "code"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Product(TimeStampedModel):
    product_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    base_price = models.DecimalField(max_digits=12, decimal_places=2)

    category_master = models.ForeignKey(
        ProductCategoryMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    subcategory_master = models.ForeignKey(
        ProductSubcategoryMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    category = models.CharField(max_length=120, blank=True, default="", db_index=True)
    subcategory = models.CharField(max_length=120, blank=True, default="", db_index=True)
    sku = models.CharField(max_length=60, unique=True, null=True, blank=True, db_index=True)
    unit_of_measure_master = models.ForeignKey(
        ProductUnitOfMeasureMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    unit_of_measure = models.CharField(max_length=30, blank=True, default="PCS")
    description = models.TextField(blank=True, default="")
    image = models.ImageField(upload_to=product_image_upload_to, null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    plan_type_default = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        default=PlanType.EMI,
        db_index=True,
    )
    is_emi_enabled = models.BooleanField(default=True, db_index=True)
    is_rent_enabled = models.BooleanField(default=False, db_index=True)
    is_lease_enabled = models.BooleanField(default=False, db_index=True)
    is_rent_ready = models.BooleanField(default=False, db_index=True)
    is_lease_ready = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = "products"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["product_code"]),
            models.Index(fields=["name"]),
            models.Index(fields=["category"]),
            models.Index(fields=["subcategory"]),
            models.Index(fields=["sku"]),
            models.Index(fields=["unit_of_measure"]),
            models.Index(fields=["is_active"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(base_price__gt=0),
                name="chk_product_base_price_positive",
            ),
        ]

    def clean(self):
        errors = {}

        if not self.product_code or not self.product_code.strip():
            errors["product_code"] = "Product code is required."
        if not self.name or not self.name.strip():
            errors["name"] = "Product name is required."
        if self.base_price is None or self.base_price <= MONEY_ZERO:
            errors["base_price"] = "Base price must be greater than zero."
        if self.subcategory_master_id and self.category_master_id:
            if self.subcategory_master.category_id != self.category_master_id:
                errors["subcategory_master"] = "Subcategory must belong to the selected category."
        if self.plan_type_default not in PlanType.values:
            errors["plan_type_default"] = "Unsupported default plan type."
        if not any([self.is_emi_enabled, self.is_rent_enabled, self.is_lease_enabled]):
            errors["is_emi_enabled"] = "At least one product mode must be enabled."
        if self.plan_type_default == PlanType.EMI and not self.is_emi_enabled:
            errors["plan_type_default"] = "Default plan type EMI requires EMI to be enabled."
        if self.plan_type_default == PlanType.RENT and not self.is_rent_enabled:
            errors["plan_type_default"] = "Default plan type RENT requires rent to be enabled."
        if self.plan_type_default == PlanType.LEASE and not self.is_lease_enabled:
            errors["plan_type_default"] = "Default plan type LEASE requires lease to be enabled."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        update_field_set = set(update_fields) if update_fields is not None else None

        self.product_code = (self.product_code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        from products.services.catalog_master_service import (
            sync_inventory_product_master_fields,
            sync_product_catalog_fields,
        )

        synced_fields = sync_product_catalog_fields(self)
        self.is_rent_ready = bool(self.is_rent_enabled)
        self.is_lease_ready = bool(self.is_lease_enabled)
        if update_field_set is not None:
            update_field_set.update(synced_fields)
            update_field_set.update({"is_rent_ready", "is_lease_ready"})
            kwargs["update_fields"] = sorted(update_field_set)
        self.full_clean()
        super().save(*args, **kwargs)
        sync_inventory_product_master_fields(self)

    def __str__(self):
        return f"{self.product_code} - {self.name}"


class PublicLead(TimeStampedModel):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=10, db_index=True)
    email = models.EmailField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        related_name="public_leads",
        null=True,
        blank=True,
    )
    interested_product = models.CharField(max_length=255, blank=True, default="")
    preferred_emi_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True, default="")
    admin_notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=PublicLeadStatus.choices,
        default=PublicLeadStatus.NEW,
        db_index=True,
    )
    intent = models.CharField(
        max_length=20,
        choices=PublicLeadIntent.choices,
        default=PublicLeadIntent.GENERAL,
        db_index=True,
    )
    source = models.CharField(max_length=40, default="PUBLIC_SITE")
    follow_up_required = models.BooleanField(default=False, db_index=True)
    follow_up_on = models.DateField(null=True, blank=True, db_index=True)
    follow_up_note = models.TextField(blank=True, default="")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_public_leads",
        null=True,
        blank=True,
    )
    converted_customer = models.ForeignKey(
        "Customer",
        on_delete=models.SET_NULL,
        related_name="converted_public_leads",
        null=True,
        blank=True,
    )
    converted_subscription = models.ForeignKey(
        "Subscription",
        on_delete=models.SET_NULL,
        related_name="converted_public_leads",
        null=True,
        blank=True,
    )
    converted_direct_sale = models.ForeignKey(
        "billing.DirectSale",
        on_delete=models.SET_NULL,
        related_name="converted_public_leads",
        null=True,
        blank=True,
    )
    converted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="converted_public_leads",
        null=True,
        blank=True,
    )
    assigned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    contacted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    converted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "public_leads"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["status"]),
            models.Index(fields=["name"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["converted_customer", "created_at"]),
            models.Index(fields=["converted_subscription", "created_at"]),
            models.Index(fields=["converted_direct_sale", "created_at"]),
        ]

    def clean(self):
        errors = {}

        if not self.name or not self.name.strip():
            errors["name"] = "Lead name is required."

        normalized_phone = (self.phone or "").strip()
        if not normalized_phone:
            errors["phone"] = "Phone number is required."
        if self.follow_up_required and self.follow_up_on is None:
            errors["follow_up_on"] = "Follow-up date is required when follow-up is marked required."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.city = (self.city or "").strip()
        self.interested_product = (self.interested_product or "").strip()
        self.notes = (self.notes or "").strip()
        self.admin_notes = (self.admin_notes or "").strip()
        self.intent = (self.intent or PublicLeadIntent.GENERAL).strip().upper()
        self.source = (self.source or "").strip() or "PUBLIC_SITE"
        self.follow_up_note = (self.follow_up_note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Lead #{self.id} - {self.name} ({self.phone})"


class CustomerSupportRequest(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="support_requests",
    )
    payment = models.ForeignKey(
        "Payment",
        on_delete=models.PROTECT,
        related_name="support_requests",
        null=True,
        blank=True,
    )
    subscription = models.ForeignKey(
        "Subscription",
        on_delete=models.PROTECT,
        related_name="support_requests",
        null=True,
        blank=True,
    )
    category = models.CharField(
        max_length=30,
        choices=SupportRequestCategory.choices,
        default=SupportRequestCategory.OTHER,
        db_index=True,
    )
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=SupportRequestStatus.choices,
        default=SupportRequestStatus.SUBMITTED,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assigned_support_requests",
        null=True,
        blank=True,
    )
    assigned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    internal_notes = models.TextField(blank=True, default="")
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="resolved_support_requests",
        null=True,
        blank=True,
    )
    resolution_summary = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "customer_support_requests"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "created_at"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["category", "created_at"]),
            models.Index(fields=["assigned_to", "created_at"]),
            models.Index(fields=["payment"]),
            models.Index(fields=["subscription"]),
            models.Index(fields=["resolved_by", "created_at"]),
        ]

    def clean(self):
        errors = {}

        if not self.message or not self.message.strip():
            errors["message"] = "Support message is required."

        if self.payment_id and self.customer_id:
            if self.payment.customer_id != self.customer_id:
                errors["payment"] = "Selected payment does not belong to this customer."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["subscription"] = "Selected subscription does not belong to this customer."

        if self.payment_id and self.subscription_id:
            if self.payment.subscription_id != self.subscription_id:
                errors["subscription"] = "Selected payment does not belong to the selected subscription."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.message = (self.message or "").strip()
        self.internal_notes = (self.internal_notes or "").strip()
        self.resolution_summary = (self.resolution_summary or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"SupportRequest #{self.pk} - Customer #{self.customer_id}"


class SubscriptionRequest(TimeStampedModel):
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="subscription_requests",
    )
    requester_role_snapshot = models.CharField(max_length=20, db_index=True)
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_subscription_requests",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey(
        "Customer",
        on_delete=models.PROTECT,
        related_name="subscription_requests",
        null=True,
        blank=True,
    )
    requested_customer_name = models.CharField(max_length=100, blank=True, default="")
    requested_customer_phone = models.CharField(max_length=15, blank=True, default="")
    requested_customer_email = models.EmailField(blank=True, default="")
    requested_customer_address = models.TextField(blank=True, default="")
    requested_customer_city = models.CharField(max_length=100, blank=True, default="")
    product = models.ForeignKey(
        "Product",
        on_delete=models.PROTECT,
        related_name="subscription_requests",
    )
    batch = models.ForeignKey(
        "Batch",
        on_delete=models.PROTECT,
        related_name="subscription_requests",
    )
    preferred_lucky_number = models.PositiveSmallIntegerField()
    requested_tenure_months_snapshot = models.PositiveIntegerField()
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=SubscriptionRequestStatus.choices,
        default=SubscriptionRequestStatus.SUBMITTED,
        db_index=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviewed_subscription_requests",
        null=True,
        blank=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    review_note = models.TextField(blank=True, default="")
    approved_subscription = models.OneToOneField(
        "subscriptions.Subscription",
        on_delete=models.PROTECT,
        related_name="subscription_request",
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "subscription_requests"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["requester", "status"]),
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["product", "batch"]),
            models.Index(fields=["batch", "status"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(preferred_lucky_number__gte=0)
                & Q(preferred_lucky_number__lte=99),
                name="chk_subscription_request_lucky_number_range",
            ),
            models.CheckConstraint(
                condition=Q(requested_tenure_months_snapshot__gt=0),
                name="chk_subscription_request_tenure_positive",
            ),
        ]

    def clean(self):
        errors = {}

        valid_role_snapshots = {"ADMIN", "PARTNER", "CUSTOMER", "CASHIER"}

        if not self.requester_role_snapshot or not self.requester_role_snapshot.strip():
            errors["requester_role_snapshot"] = "Requester role snapshot is required."
        elif self.requester_role_snapshot not in valid_role_snapshots:
            errors["requester_role_snapshot"] = "Requester role snapshot is invalid."

        if self.requester_role_snapshot == "CUSTOMER":
            if self.partner_id:
                errors["partner"] = "Customer subscription requests cannot carry a partner."
            if self.customer_id and self.customer.user_id != self.requester_id:
                errors["customer"] = "Customer requests must be linked to the requesting customer profile."

        if self.requester_role_snapshot == "PARTNER" and self.partner_id != self.requester_id:
            errors["partner"] = "Partner requests must use the requesting partner identity."

        if not self.customer_id:
            if not self.requested_customer_name or not self.requested_customer_name.strip():
                errors["requested_customer_name"] = "Customer name is required when no customer is linked."
            if not self.requested_customer_phone or not self.requested_customer_phone.strip():
                errors["requested_customer_phone"] = "Customer phone is required when no customer is linked."
            if not self.requested_customer_email or not self.requested_customer_email.strip():
                errors["requested_customer_email"] = "Customer email is required when no customer is linked."

        if self.approved_subscription_id and self.status != SubscriptionRequestStatus.APPROVED:
            errors["status"] = "Approved subscription can only exist for approved requests."

        if self.status == SubscriptionRequestStatus.APPROVED:
            if not self.approved_subscription_id:
                errors["approved_subscription"] = "Approved subscription is required for approved requests."
            if not self.reviewed_by_id or not self.reviewed_at:
                errors["reviewed_by"] = "Approved requests must store review metadata."

        if self.status == SubscriptionRequestStatus.REJECTED:
            if not self.reviewed_by_id or not self.reviewed_at:
                errors["reviewed_by"] = "Rejected requests must store review metadata."

        if self.customer_id and self.approved_subscription_id:
            if self.approved_subscription.customer_id != self.customer_id:
                errors["approved_subscription"] = "Approved subscription must belong to the resolved customer."

        if self.approved_subscription_id:
            if self.approved_subscription.product_id != self.product_id:
                errors["approved_subscription"] = "Approved subscription must match the requested product."
            if self.approved_subscription.batch_id != self.batch_id:
                errors["approved_subscription"] = "Approved subscription must match the requested batch."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.requester_role_snapshot = (self.requester_role_snapshot or "").strip().upper()
        self.requested_customer_name = (self.requested_customer_name or "").strip()
        self.requested_customer_phone = (self.requested_customer_phone or "").strip()
        self.requested_customer_email = (self.requested_customer_email or "").strip()
        self.requested_customer_address = (self.requested_customer_address or "").strip()
        self.requested_customer_city = (self.requested_customer_city or "").strip()
        self.notes = (self.notes or "").strip()
        self.review_note = (self.review_note or "").strip()

        if self.customer_id:
            self.requested_customer_name = self.requested_customer_name or self.customer.name
            self.requested_customer_phone = self.requested_customer_phone or self.customer.phone
            self.requested_customer_email = (
                self.requested_customer_email
                or getattr(self.customer.user, "email", "")
                or ""
            )
            self.requested_customer_address = (
                self.requested_customer_address or self.customer.address
            )
            self.requested_customer_city = self.requested_customer_city or self.customer.city

        if not self.requested_tenure_months_snapshot and self.batch_id:
            self.requested_tenure_months_snapshot = self.batch.duration_months

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"SubscriptionRequest #{self.pk} - {self.status}"


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

            lucky_id_changed = False
            if self.pk:
                old = Subscription.objects.filter(pk=self.pk).only("lucky_id_id").first()
                lucky_id_changed = bool(old and old.lucky_id_id != self.lucky_id_id)

            if (not self.pk or lucky_id_changed) and self.lucky_id.status != LuckyIdStatus.AVAILABLE:
                raise ValidationError({"lucky_id": "Selected Lucky ID is not available."})

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

# =====================================================
# DELIVERY
# =====================================================

class SubscriptionDelivery(TimeStampedModel):
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="deliveries",
    )
    status = models.CharField(
        max_length=30,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        db_index=True,
    )
    delivery_reference = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
    )
    scheduled_date = models.DateField(null=True, blank=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    out_for_delivery_at = models.DateTimeField(null=True, blank=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True, db_index=True)
    failed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    return_requested_at = models.DateTimeField(null=True, blank=True, db_index=True)
    returned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    receiver_name = models.CharField(max_length=100, blank=True, default="")
    receiver_phone = models.CharField(max_length=20, blank=True, default="")
    delivery_address_snapshot = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    failure_reason = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_subscription_deliveries",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_subscription_deliveries",
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "subscription_deliveries"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["delivered_at"]),
            models.Index(fields=["delivery_reference"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["subscription"],
                condition=Q(
                    status__in=[
                        DeliveryStatus.PENDING,
                        DeliveryStatus.SCHEDULED,
                        DeliveryStatus.DISPATCHED,
                        DeliveryStatus.OUT_FOR_DELIVERY,
                        DeliveryStatus.RETURN_REQUESTED,
                    ]
                ),
                name="uq_active_subscription_delivery_per_subscription",
            ),
        ]

    TERMINAL_STATUSES = {
        DeliveryStatus.DELIVERED,
        DeliveryStatus.FAILED,
        DeliveryStatus.CANCELLED,
        DeliveryStatus.RETURNED,
    }

    ACTIVE_STATUSES = {
        DeliveryStatus.PENDING,
        DeliveryStatus.SCHEDULED,
        DeliveryStatus.DISPATCHED,
        DeliveryStatus.OUT_FOR_DELIVERY,
        DeliveryStatus.RETURN_REQUESTED,
    }

    def clean(self):
        errors = {}

        if not self.delivery_reference or not self.delivery_reference.strip():
            errors["delivery_reference"] = "Delivery reference is required."

        if self.subscription_id and self.subscription.plan_type != PlanType.EMI:
            # Keep delivery future-safe for non-EMI plans, but require a contract.
            # No additional validation is needed today beyond the linked subscription.
            pass

        if (
            self.status == DeliveryStatus.SCHEDULED
            and self.scheduled_date is None
        ):
            errors["scheduled_date"] = "Scheduled date is required for scheduled deliveries."

        if self.status == DeliveryStatus.DISPATCHED and self.dispatched_at is None:
            errors["dispatched_at"] = "Dispatch timestamp is required for dispatched deliveries."

        if (
            self.status == DeliveryStatus.OUT_FOR_DELIVERY
            and self.out_for_delivery_at is None
        ):
            errors["out_for_delivery_at"] = (
                "Out-for-delivery timestamp is required for this status."
            )

        if self.status == DeliveryStatus.DELIVERED and self.delivered_at is None:
            errors["delivered_at"] = "Delivered timestamp is required for delivered records."

        if self.status == DeliveryStatus.FAILED and self.failed_at is None:
            errors["failed_at"] = "Failed timestamp is required for failed deliveries."

        if self.status == DeliveryStatus.CANCELLED and self.cancelled_at is None:
            errors["cancelled_at"] = "Cancelled timestamp is required for cancelled deliveries."

        if (
            self.status == DeliveryStatus.RETURN_REQUESTED
            and self.return_requested_at is None
        ):
            errors["return_requested_at"] = (
                "Return-requested timestamp is required for this status."
            )

        if self.status == DeliveryStatus.RETURNED and self.returned_at is None:
            errors["returned_at"] = "Returned timestamp is required for returned deliveries."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.delivery_reference = (self.delivery_reference or "").strip().upper()
        self.receiver_name = (self.receiver_name or "").strip()
        self.receiver_phone = (self.receiver_phone or "").strip()
        self.delivery_address_snapshot = (self.delivery_address_snapshot or "").strip()
        self.failure_reason = (self.failure_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES

    @property
    def is_active_delivery(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    def __str__(self):
        return f"{self.delivery_reference} - Subscription {self.subscription_id}"


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

    def net_paid_amount(self) -> Decimal:
        effective_paid = (
            FinancialLedger.objects.filter(
                emi=self,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        reversal_total = (
            FinancialLedger.objects.filter(
                emi=self,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        net_paid = q2(Decimal(str(effective_paid)) - Decimal(str(reversal_total)))
        return q2(max(net_paid, MONEY_ZERO))

    def total_paid(self) -> Decimal:
        return self.net_paid_amount()

    def balance_amount(self) -> Decimal:
        balance = q2(self.amount) - q2(self.net_paid_amount())
        return q2(max(balance, MONEY_ZERO))

    def is_fully_paid(self) -> bool:
        return self.balance_amount() <= MONEY_ZERO

    def is_overdue(self) -> bool:
        return self.status == EmiStatus.PENDING and self.due_date < timezone.localdate()

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
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscription_payments",
    )
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    reference_no = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    payment_date = models.DateField(db_index=True)
    plan_type_hint = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    allocation_metadata = models.JSONField(default=dict, blank=True)
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
            models.Index(fields=["branch", "payment_date"]),
            models.Index(fields=["cash_counter", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
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
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected counter must belong to the payment branch."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected finance account must be active."
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
                errors["finance_account"] = "Selected finance account must belong to the payment branch."

        if self.reference_no is not None:
            self.reference_no = self.reference_no.strip() or None

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        if not self.plan_type_hint and self.subscription_id:
            self.plan_type_hint = self.subscription.plan_type
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.subscription, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment #{self.pk} - {self.amount}"


class CustomerAdvanceStatus(models.TextChoices):
    UNAPPLIED = "UNAPPLIED", "Unapplied"
    PARTIALLY_APPLIED = "PARTIALLY_APPLIED", "Partially Applied"
    FULLY_APPLIED = "FULLY_APPLIED", "Fully Applied"


class CustomerAdvance(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="customer_advances",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="customer_advances",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    unapplied_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    reference_no = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    payment_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=CustomerAdvanceStatus.choices,
        default=CustomerAdvanceStatus.UNAPPLIED,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    allocation_metadata = models.JSONField(default=dict, blank=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances_collected",
    )

    class Meta:
        db_table = "customer_advances"
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["customer", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
            models.Index(fields=["status", "payment_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference_no"],
                condition=Q(reference_no__isnull=False),
                name="uq_customer_advance_reference_no",
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_customer_advance_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(unapplied_amount__gte=0),
                name="chk_customer_advance_unapplied_non_negative",
            ),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Advance amount must be greater than zero."
        if self.unapplied_amount is None or self.unapplied_amount < MONEY_ZERO:
            errors["unapplied_amount"] = "Unapplied amount cannot be negative."
        if (
            self.amount is not None
            and self.unapplied_amount is not None
            and self.unapplied_amount > self.amount
        ):
            errors["unapplied_amount"] = "Unapplied amount cannot exceed advance amount."
        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected counter must belong to the advance branch."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected finance account must be active."
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
                errors["finance_account"] = "Selected finance account must belong to the advance branch."
        if self.reference_no is not None:
            self.reference_no = self.reference_no.strip() or None
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        if self.pk is None and self.unapplied_amount is None:
            self.unapplied_amount = self.amount
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Advance #{self.pk} - {self.amount}"


class CustomerAdvanceAllocation(TimeStampedModel):
    advance = models.ForeignKey(
        CustomerAdvance,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        related_name="advance_allocations",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="advance_allocations",
    )
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advance_allocation",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    allocated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advance_allocations",
    )
    allocation_date = models.DateField(db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "customer_advance_allocations"
        ordering = ["-allocation_date", "-id"]
        indexes = [
            models.Index(fields=["advance", "allocation_date"]),
            models.Index(fields=["subscription", "allocation_date"]),
            models.Index(fields=["emi", "allocation_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_customer_advance_allocation_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Allocation amount must be greater than zero."
        if not self.allocation_date:
            errors["allocation_date"] = "Allocation date is required."
        if self.emi_id and self.subscription_id and self.emi.subscription_id != self.subscription_id:
            errors["emi"] = "Selected EMI must belong to the selected subscription."
        if self.subscription_id and self.advance_id:
            if self.subscription.customer_id != self.advance.customer_id:
                errors["subscription"] = "Advance can be allocated only within the same customer."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Advance Allocation #{self.pk} - {self.amount}"
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

class PartnerCollectionRequestStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class PartnerCollectionRequest(models.Model):
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    subscription = models.ForeignKey(
        "subscriptions.Subscription",
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        db_index=True,
    )

    payment_date = models.DateField(db_index=True)

    reference_no = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_index=True,
    )

    notes = models.TextField(blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=PartnerCollectionRequestStatus.choices,
        default=PartnerCollectionRequestStatus.SUBMITTED,
        db_index=True,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_partner_collection_requests",
    )

    reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    review_note = models.TextField(blank=True, default="")

    approved_payment = models.OneToOneField(
        "subscriptions.Payment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_collection_request",
    )

    approved_emi = models.ForeignKey(
        "subscriptions.Emi",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_collection_requests_approved",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "partner_collection_requests"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_partner_collection_request_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Amount must be greater than zero."

        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."

        if self.partner_id and getattr(self.partner, "role", None) != "PARTNER":
            errors["partner"] = "Only partner users can create partner collection requests."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer must match subscription."

        if self.subscription_id and self.partner_id:
            if self.subscription.partner_id != self.partner_id:
                errors["subscription"] = "Subscription must belong to the requesting partner."

        if self.approved_payment_id and self.status != PartnerCollectionRequestStatus.APPROVED:
            errors["status"] = "Approved payment can only exist for approved requests."

        if self.approved_emi_id and self.approved_payment_id:
            if self.approved_payment.emi_id and self.approved_payment.emi_id != self.approved_emi_id:
                errors["approved_emi"] = "Approved EMI must match approved payment EMI."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        self.review_note = (self.review_note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PartnerCollectionRequest #{self.pk} - Subscription {self.subscription_id}"




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
    winner_subscription = models.ForeignKey(
        "subscriptions.Subscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="winning_draws",
    )
    draw_date = models.DateTimeField(default=timezone.now)
    draw_month = models.PositiveIntegerField()
    is_revealed = models.BooleanField(default=False, db_index=True)
    revealed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    waived_emi_count = models.PositiveIntegerField(default=0)
    waived_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )
    waiver_scope = models.CharField(
        max_length=40,
        default="FUTURE_EMI_ONLY",
    )

    class Meta:
        db_table = "lucky_draws"
        ordering = ["-draw_date", "-id"]
        unique_together = ("batch", "draw_month")
        indexes = [
            models.Index(fields=["batch", "draw_month"]),
            models.Index(fields=["is_revealed"]),
            models.Index(fields=["revealed_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(draw_month__gt=0),
                name="chk_draw_month_positive",
            ),
            models.CheckConstraint(
                condition=Q(waived_emi_count__gte=0),
                name="chk_lucky_draw_waived_emi_count_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(waived_amount__gte=0),
                name="chk_lucky_draw_waived_amount_non_negative",
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

        if self.winner_subscription and self.winner_subscription.batch_id != self.batch_id:
            errors["winner_subscription"] = "Winner subscription must belong to the same batch."

        if self.winner_subscription and self.winner_lucky_id:
            if self.winner_subscription.lucky_id_id != self.winner_lucky_id_id:
                errors["winner_subscription"] = "Winner subscription must match winner Lucky ID."

        if self.is_revealed:
            if not self.revealed_seed:
                errors["revealed_seed"] = "Revealed seed is required when draw is revealed."
            if not self.winner_lucky_id:
                errors["winner_lucky_id"] = "Winner Lucky ID is required when draw is revealed."
            if not self.winner_subscription:
                errors["winner_subscription"] = "Winner subscription is required when draw is revealed."
            if not self.revealed_at:
                errors["revealed_at"] = "Reveal timestamp is required when draw is revealed."

        if self.waived_amount is not None and self.waived_amount < MONEY_ZERO:
            errors["waived_amount"] = "Waived amount cannot be negative."

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
        USER_CREATED = "USER_CREATED", "User Created"   
        USER_UPDATED = "USER_UPDATED", "User Updated"
        PUBLIC_SITE_UPDATED = "PUBLIC_SITE_UPDATED", "Public Site Updated"
        USER_ACTIVATED = "USER_ACTIVATED", "User Activated"
        USER_DEACTIVATED = "USER_DEACTIVATED", "User Deactivated"
        USER_PASSWORD_RESET = "USER_PASSWORD_RESET", "User Password Reset"
        PARTNER_COMMISSION_SET = "PARTNER_COMMISSION_SET", "Partner Commission Set"
        PARTNER_COMMISSION_UPDATED = "PARTNER_COMMISSION_UPDATED", "Partner Commission Updated"
        LEAD_CREATED = "LEAD_CREATED", "Lead Created"
        LEAD_STATUS_UPDATED = "LEAD_STATUS_UPDATED", "Lead Status Updated"
        LEAD_ASSIGNED = "LEAD_ASSIGNED", "Lead Assigned"
        LEAD_NOTE_UPDATED = "LEAD_NOTE_UPDATED", "Lead Notes Updated"
        LEAD_CUSTOMER_LINKED = "LEAD_CUSTOMER_LINKED", "Lead Customer Linked"
        LEAD_SUBSCRIPTION_LINKED = "LEAD_SUBSCRIPTION_LINKED", "Lead Subscription Linked"
        LEAD_DIRECT_SALE_LINKED = "LEAD_DIRECT_SALE_LINKED", "Lead Direct Sale Linked"
        LEAD_CONVERTED = "LEAD_CONVERTED", "Lead Converted"
        CRM_PARTY_CREATED = "CRM_PARTY_CREATED", "CRM Party Created"
        CRM_PARTY_LINKED = "CRM_PARTY_LINKED", "CRM Party Linked"
        CRM_INTERACTION_CREATED = "CRM_INTERACTION_CREATED", "CRM Interaction Created"
        CRM_INTERACTION_UPDATED = "CRM_INTERACTION_UPDATED", "CRM Interaction Updated"
        SUPPORT_REQUEST_CREATED = "SUPPORT_REQUEST_CREATED", "Support Request Created"
        SUPPORT_REQUEST_STATUS_UPDATED = "SUPPORT_REQUEST_STATUS_UPDATED", "Support Request Status Updated"
        SUPPORT_REQUEST_ASSIGNED = "SUPPORT_REQUEST_ASSIGNED", "Support Request Assigned"
        SUPPORT_REQUEST_NOTE_UPDATED = "SUPPORT_REQUEST_NOTE_UPDATED", "Support Request Notes Updated"
        SUPPORT_REQUEST_RESOLVED = "SUPPORT_REQUEST_RESOLVED", "Support Request Resolved"
        SUPPORT_REQUEST_RESOLUTION_RECORDED = (
            "SUPPORT_REQUEST_RESOLUTION_RECORDED",
            "Support Request Resolution Recorded",
        )
        SERVICE_DESK_CASE_CREATED = "SERVICE_DESK_CASE_CREATED", "Service Desk Case Created"
        SERVICE_DESK_CASE_UPDATED = "SERVICE_DESK_CASE_UPDATED", "Service Desk Case Updated"
        SERVICE_DESK_CASE_STATUS_UPDATED = "SERVICE_DESK_CASE_STATUS_UPDATED", "Service Desk Case Status Updated"
        SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED = (
            "SERVICE_DESK_CASE_DELIVERY_RETURN_REQUESTED",
            "Service Desk Case Delivery Return Requested",
        )
        SERVICE_DESK_CASE_DELIVERY_RETURNED = (
            "SERVICE_DESK_CASE_DELIVERY_RETURNED",
            "Service Desk Case Delivery Returned",
        )
        SERVICE_DESK_CASE_CREDIT_NOTE_POSTED = (
            "SERVICE_DESK_CASE_CREDIT_NOTE_POSTED",
            "Service Desk Case Credit Note Posted",
        )
        SERVICE_DESK_CASE_DEBIT_NOTE_POSTED = (
            "SERVICE_DESK_CASE_DEBIT_NOTE_POSTED",
            "Service Desk Case Debit Note Posted",
        )
        SERVICE_DESK_CASE_REPLACEMENT_LINKED = (
            "SERVICE_DESK_CASE_REPLACEMENT_LINKED",
            "Service Desk Case Replacement Linked",
        )
        DELIVERY_CREATED = "DELIVERY_CREATED", "Delivery Created"
        DELIVERY_UPDATED = "DELIVERY_UPDATED", "Delivery Updated"
        DELIVERY_STATUS_CHANGED = "DELIVERY_STATUS_CHANGED", "Delivery Status Changed"
        DELIVERY_DISPATCHED = "DELIVERY_DISPATCHED", "Delivery Dispatched"
        DELIVERY_COMPLETED = "DELIVERY_COMPLETED", "Delivery Completed"
        DELIVERY_FAILED = "DELIVERY_FAILED", "Delivery Failed"
        DELIVERY_CANCELLED = "DELIVERY_CANCELLED", "Delivery Cancelled"
        DELIVERY_RETURN_REQUESTED = "DELIVERY_RETURN_REQUESTED", "Delivery Return Requested"
        DELIVERY_RETURNED = "DELIVERY_RETURNED", "Delivery Returned"
        SUB_CREATED = "SUB_CREATED", "Subscription Created"
        SUBSCRIPTION_REQUEST_CREATED = (
            "SUBSCRIPTION_REQUEST_CREATED",
            "Subscription Request Created",
        )
        SUBSCRIPTION_REQUEST_APPROVED = (
            "SUBSCRIPTION_REQUEST_APPROVED",
            "Subscription Request Approved",
        )
        SUBSCRIPTION_REQUEST_REJECTED = (
            "SUBSCRIPTION_REQUEST_REJECTED",
            "Subscription Request Rejected",
        )
        SUBSCRIPTION_REQUEST_CANCELLED = (
            "SUBSCRIPTION_REQUEST_CANCELLED",
            "Subscription Request Cancelled",
        )
        EMI_PAID = "EMI_PAID", "EMI Paid"
        EMI_WAIVED = "EMI_WAIVED", "EMI Waived"
        DRAW_EXECUTED = "DRAW_EXECUTED", "Draw Executed"
        DRAW_COMMITTED = "DRAW_COMMITTED", "Draw Committed"
        DRAW_REVEALED = "DRAW_REVEALED", "Draw Revealed"
        WINNER_WAIVER_APPLIED = "WINNER_WAIVER_APPLIED", "Winner Waiver Applied"
        WINNER_STATE_SYNCED = "WINNER_STATE_SYNCED", "Winner State Synced"
        COMMISSION_CREATED = "COMMISSION_CREATED", "Commission Created"
        COMMISSION_SETTLED = "COMMISSION_SETTLED", "Commission Settled"
        COMMISSION_PAYOUT_BATCH_CREATED = (
            "COMMISSION_PAYOUT_BATCH_CREATED",
            "Commission Payout Batch Created",
        )
        COMMISSION_PAYOUT_BATCH_FINALIZED = (
            "COMMISSION_PAYOUT_BATCH_FINALIZED",
            "Commission Payout Batch Finalized",
        )
        COMMISSION_PAYOUT_BATCH_CANCELLED = (
            "COMMISSION_PAYOUT_BATCH_CANCELLED",
            "Commission Payout Batch Cancelled",
        )
        PAYMENT_RECONCILED = "PAYMENT_RECONCILED", "Payment Reconciled"
        PAYMENT_FLAGGED = "PAYMENT_FLAGGED", "Payment Flagged"
        PRODUCT_INVENTORY_PROFILE_PREPARED = (
            "PRODUCT_INVENTORY_PROFILE_PREPARED",
            "Product Inventory Profile Prepared",
        )
        INVENTORY_ITEM_CREATED = "INVENTORY_ITEM_CREATED", "Inventory Item Created"
        INVENTORY_ITEM_UPDATED = "INVENTORY_ITEM_UPDATED", "Inventory Item Updated"
        STOCK_LOCATION_CREATED = "STOCK_LOCATION_CREATED", "Stock Location Created"
        STOCK_LOCATION_UPDATED = "STOCK_LOCATION_UPDATED", "Stock Location Updated"
        STOCK_ADJUSTMENT_CREATED = "STOCK_ADJUSTMENT_CREATED", "Stock Adjustment Created"
        STOCK_ADJUSTMENT_UPDATED = "STOCK_ADJUSTMENT_UPDATED", "Stock Adjustment Updated"
        STOCK_ADJUSTMENT_APPROVED = "STOCK_ADJUSTMENT_APPROVED", "Stock Adjustment Approved"
        STOCK_ADJUSTMENT_POSTED = "STOCK_ADJUSTMENT_POSTED", "Stock Adjustment Posted"
        OPENING_STOCK_IMPORTED = "OPENING_STOCK_IMPORTED", "Opening Stock Imported"
        DELIVERY_INVENTORY_BRIDGE_SYNCED = (
            "DELIVERY_INVENTORY_BRIDGE_SYNCED",
            "Delivery Inventory Bridge Synced",
        )
        MANUFACTURING_BOM_CREATED = "MANUFACTURING_BOM_CREATED", "Manufacturing BOM Created"
        MANUFACTURING_BOM_UPDATED = "MANUFACTURING_BOM_UPDATED", "Manufacturing BOM Updated"
        MANUFACTURING_BOM_STATUS_UPDATED = (
            "MANUFACTURING_BOM_STATUS_UPDATED",
            "Manufacturing BOM Status Updated",
        )
        PRODUCTION_JOB_CREATED = "PRODUCTION_JOB_CREATED", "Production Job Created"
        PRODUCTION_JOB_UPDATED = "PRODUCTION_JOB_UPDATED", "Production Job Updated"
        PRODUCTION_JOB_STATUS_UPDATED = (
            "PRODUCTION_JOB_STATUS_UPDATED",
            "Production Job Status Updated",
        )
        PRODUCTION_MATERIAL_MOVEMENT_POSTED = (
            "PRODUCTION_MATERIAL_MOVEMENT_POSTED",
            "Production Material Movement Posted",
        )
        PRODUCTION_OUTPUT_POSTED = "PRODUCTION_OUTPUT_POSTED", "Production Output Posted"

        PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED", "Password Reset Requested"
        PASSWORD_RESET_VERIFIED = "PASSWORD_RESET_VERIFIED", "Password Reset Verified"
        PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED", "Password Reset Completed"
        PASSWORD_RESET_FAILED = "PASSWORD_RESET_FAILED", "Password Reset Failed"
        PASSWORD_RESET_EXPIRED = "PASSWORD_RESET_EXPIRED", "Password Reset Expired"
        PASSWORD_RESET_LOCKED = "PASSWORD_RESET_LOCKED", "Password Reset Locked"
        PASSWORD_RESET_RESENT = "PASSWORD_RESET_RESENT", "Password Reset Resent"
        PASSWORD_RESET_INVALIDATED = "PASSWORD_RESET_INVALIDATED", "Password Reset Invalidated"

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
    plan_type_hint = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    allocation_context = models.JSONField(default=dict, blank=True)

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
        if not self.plan_type_hint and self.emi_id:
            self.plan_type_hint = self.emi.subscription.plan_type
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.entry_type} - {self.amount}"




    

# ================================
# COMMISSION SYSTEM (ADDITIVE)
# ================================




class Commission(models.Model):
    """
    Commission model tied strictly to payment lifecycle.

    Design principles:
    - One commission per payment (enforced via OneToOne)
    - Immutable financial record (status transitions only)
    - Safe for future rental/leasing extension
    """

    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commissions",
    )

    subscription = models.ForeignKey(
        "subscriptions.Subscription",
        on_delete=models.PROTECT,
        related_name="commissions",
        null=True,
        blank=True,
    )

    payment = models.OneToOneField(
        "subscriptions.Payment",
        on_delete=models.PROTECT,
        related_name="commission",
        null=True,
        blank=True,
    )

    emi = models.ForeignKey(
        "subscriptions.Emi",
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
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        FINALIZED = "FINALIZED", "Finalized"
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

    processed_by = models.ForeignKey(
        User,
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
        "subscriptions.Commission",
        on_delete=models.PROTECT,
        related_name="payout_line",
    )

    partner = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="commission_payout_lines",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name="commission_payout_line_amount_non_negative",
            )
        ]

    def __str__(self):
        return f"Batch {self.payout_batch_id} → Commission {self.commission_id}"
