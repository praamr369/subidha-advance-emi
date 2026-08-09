from decimal import Decimal
from pathlib import Path
from uuid import uuid4
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.db.models import Q, F
from django.db.models import Sum
from django.utils import timezone
from django.apps import apps

from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, q2,
    customer_photo_upload_to, customer_kyc_doc_upload_to
)
from subscriptions.enums import (
    KycStatus, CustomerSource, SupportRequestCategory, SupportRequestStatus
)

PIN_VALIDATOR = RegexValidator(
    regex=r'^\d{6}$',
    message='PIN must be exactly 6 digits',
    code='invalid_pin'
)

class CustomerRiskBand(models.TextChoices):
    LOW = "LOW", "Low Risk"
    MEDIUM = "MEDIUM", "Medium Risk"
    HIGH = "HIGH", "High Risk"
    BLOCKED = "BLOCKED", "Blocked"

class DisputeType(models.TextChoices):
    PAYMENT_DISPUTE = "PAYMENT_DISPUTE", "Payment Dispute"
    DELIVERY_DISPUTE = "DELIVERY_DISPUTE", "Delivery Dispute"
    PRODUCT_DEFECT = "PRODUCT_DEFECT", "Product Defect"
    BILLING_ERROR = "BILLING_ERROR", "Billing Error"
    KYC_ISSUE = "KYC_ISSUE", "KYC Issue"
    OTHER = "OTHER", "Other"

class DisputeStage(models.TextChoices):
    OPEN = "OPEN", "Open"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    RESOLVED = "RESOLVED", "Resolved"
    REJECTED = "REJECTED", "Rejected"
    ESCALATED = "ESCALATED", "Escalated"

class KycOwnerType(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    PARTNER = "PARTNER", "Partner"
    VENDOR = "VENDOR", "Vendor"
    STAFF = "STAFF", "Staff"

class KycUploadSource(models.TextChoices):
    ADMIN_UPLOAD = "ADMIN_UPLOAD", "Admin Upload"
    SELF_SERVICE_UPLOAD = "SELF_SERVICE_UPLOAD", "Self-Service Upload"
    CRM_UPLOAD = "CRM_UPLOAD", "CRM Upload"
    SUBSCRIPTION_REGISTRATION = "SUBSCRIPTION_REGISTRATION", "Subscription Registration"

class KycReviewActionType(models.TextChoices):
    SUBMIT = "SUBMIT", "Submitted for Review"
    APPROVE = "APPROVE", "Approved"
    REJECT = "REJECT", "Rejected"
    REQUEST_RESUBMISSION = "REQUEST_RESUBMISSION", "Resubmission Requested"
    EXCEPTION_APPROVE = "EXCEPTION_APPROVE", "Exception Approved (Admin Override)"
    EXPIRE = "EXPIRE", "Expired"
    UPLOAD = "UPLOAD", "Document Uploaded"

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
    # AML / PEP compliance flags (all nullable/blank-safe, additive)
    is_pep = models.BooleanField(default=False, db_index=True, verbose_name="Politically Exposed Person (PEP)")
    pep_flagged_at = models.DateTimeField(null=True, blank=True)
    pep_flagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pep_flagged_customers",
    )
    aml_cleared = models.BooleanField(default=False, db_index=True, verbose_name="AML Screening Cleared")
    aml_cleared_at = models.DateTimeField(null=True, blank=True)
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    # Smart address fields — auto-filled from pincode lookup (additive, blank-safe).
    district = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="", db_index=True)

    # Phase 1 – additive fields (all nullable/blank-safe for existing rows)
    customer_source = models.CharField(
        max_length=20,
        choices=CustomerSource.choices,
        default=CustomerSource.ADMIN,
        blank=True,
        db_index=True,
    )
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customers_created",
        null=True,
        blank=True,
    )
    created_by_partner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="partner_created_customers",
        null=True,
        blank=True,
    )
    profile_photo = models.ImageField(
        upload_to=customer_photo_upload_to,
        null=True,
        blank=True,
    )
    customer_code = models.CharField(
        max_length=40,
        blank=True,
        default="",
        db_index=True,
        help_text="Human-readable short code for receipts/contracts (auto-generated if blank).",
    )

    # Reminder channel preference — additive, null/blank-safe for existing rows.
    preferred_reminder_channel = models.CharField(
        max_length=16,
        blank=True,
        default="",
        db_index=True,
        help_text="Customer's preferred channel for payment reminders (SMS / WHATSAPP / EMAIL / CALL). Blank = no preference recorded.",
    )
    whatsapp_opted_in = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when the customer has explicitly opted in to receive WhatsApp reminders.",
    )

    class Meta:
        db_table = "customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["kyc_status"]),
            models.Index(fields=["name"]),
            models.Index(fields=["kyc_reviewed_at"]),
            models.Index(fields=["city"]),
            models.Index(fields=["customer_source"]),
            models.Index(fields=["customer_code"]),
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
            apps.get_model("subscriptions", "Payment").objects.filter(customer=self).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def __str__(self):
        return f"{self.name} ({self.phone})"

class CustomerReferral(TimeStampedModel):
    """
    Tracks referral relationships between customers.
    Commission is NOT payable automatically – admin must approve.
    """

    referrer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="referrals_made",
    )
    referred = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="referred_by_referrals",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_customer_referrals",
    )
    notes = models.TextField(blank=True, default="")

    commission_enabled = models.BooleanField(
        default=False,
        help_text="Set true only when admin global referral commission feature is enabled.",
    )
    commission_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    commission_approved = models.BooleanField(default=False)
    commission_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_referral_commissions",
    )
    commission_approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "customer_referrals"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["referrer", "referred"],
                name="uq_customer_referral_pair",
            ),
        ]
        indexes = [
            models.Index(fields=["referrer", "created_at"]),
            models.Index(fields=["referred"]),
            models.Index(fields=["commission_approved"]),
        ]

    def clean(self):
        errors = {}
        if self.referrer_id and self.referred_id and self.referrer_id == self.referred_id:
            errors["referred"] = "A customer cannot refer themselves."
        if self.commission_amount < Decimal("0.00"):
            errors["commission_amount"] = "Commission amount cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Referral: {self.referrer_id} → {self.referred_id}"

class CustomerKycDocumentType(models.TextChoices):
    AADHAAR = "AADHAAR", "Aadhaar Card"
    PAN = "PAN", "PAN Card"
    PASSPORT = "PASSPORT", "Passport"
    DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
    VOTER_ID = "VOTER_ID", "Voter ID"
    OTHER = "OTHER", "Other"

class CustomerKycDocumentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Review"
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    RESUBMISSION_REQUIRED = "RESUBMISSION_REQUIRED", "Resubmission Required"

class KycDocumentCategory(models.TextChoices):
    """
    Additive readiness category for customer KYC documents.

    Lets an uploaded document be classified into the readiness buckets used by
    the contract KYC gate (ID proof, address proof, etc.) without rewriting the
    existing document_type storage. When left UNSPECIFIED the readiness service
    infers a category from ``document_type`` (e.g. AADHAAR -> ID/address proof).
    """

    UNSPECIFIED = "UNSPECIFIED", "Unspecified"
    ID_PROOF = "ID_PROOF", "Identity Proof"
    ADDRESS_PROOF = "ADDRESS_PROOF", "Address Proof"
    CUSTOMER_PHOTO = "CUSTOMER_PHOTO", "Customer Photo"
    PHONE_VERIFICATION = "PHONE_VERIFICATION", "Phone Verification"
    DELIVERY_ADDRESS_PROOF = "DELIVERY_ADDRESS_PROOF", "Delivery Address Proof"
    GUARANTOR_ID_PROOF = "GUARANTOR_ID_PROOF", "Guarantor Identity Proof"
    GUARANTOR_ADDRESS_PROOF = "GUARANTOR_ADDRESS_PROOF", "Guarantor Address Proof"
    OTHER = "OTHER", "Other"

class CustomerKycDocument(TimeStampedModel):
    """
    Customer-level KYC documents.
    Separate from SubscriptionDocument (which is linked to a specific subscription).
    Upload does NOT auto-approve; admin must approve/reject.
    """

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="kyc_documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=CustomerKycDocumentType.choices,
        default=CustomerKycDocumentType.OTHER,
        db_index=True,
    )
    # Additive readiness classification (blank-safe for existing rows). When
    # UNSPECIFIED the readiness service infers the category from document_type.
    category = models.CharField(
        max_length=30,
        choices=KycDocumentCategory.choices,
        default=KycDocumentCategory.UNSPECIFIED,
        blank=True,
        db_index=True,
    )
    file = models.FileField(upload_to=customer_kyc_doc_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=CustomerKycDocumentStatus.choices,
        default=CustomerKycDocumentStatus.SUBMITTED,
        db_index=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_kyc_documents",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_kyc_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Document expiry date. Leave blank for non-expiring documents (e.g. PAN, Voter ID).",
    )
    rejection_reason = models.TextField(blank=True, default="")
    # Additive: tracks where the upload originated (admin / self-service / CRM / registration)
    upload_source = models.CharField(
        max_length=30,
        blank=True,
        default="",
        db_index=True,
    )
    # Additive: links to the document that this is replacing (resubmission chain)
    resubmission_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
    )

    class Meta:
        db_table = "customer_kyc_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["customer", "document_type"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def clean(self):
        errors = {}
        if not self.customer_id:
            errors["customer"] = "Customer is required."
        if not self.file:
            errors["file"] = "Document file is required."
        if self.file_size < 0:
            errors["file_size"] = "File size cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.file:
            self.original_filename = (
                self.original_filename or Path(getattr(self.file, "name", "")).name
            )[:255]
            self.file_size = int(getattr(self.file, "size", None) or self.file_size or 0)
            content_type = getattr(self.file, "content_type", "") or ""
            if content_type:
                self.content_type = content_type[:100]
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"KYC {self.document_type} for customer {self.customer_id} [{self.status}]"

class CustomerRiskProfile(TimeStampedModel):
    """
    Advisory risk summary for a customer.

    Populated / refreshed by customer_risk_service.recalculate_customer_risk_profile().
    Enforcement is opt-in via the CUSTOMER_RISK_ENFORCEMENT_ENABLED policy key
    (default False). When enforcement is disabled this record is informational only
    and never gates existing workflows.
    """

    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="risk_profile",
    )
    risk_score = models.PositiveSmallIntegerField(default=0, db_index=True)
    risk_band = models.CharField(
        max_length=10,
        choices=CustomerRiskBand.choices,
        default=CustomerRiskBand.LOW,
        db_index=True,
    )
    reason_codes = models.JSONField(default=list, blank=True)
    last_calculated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "subscriptions_customer_risk_profiles"
        ordering = ["-last_calculated_at", "-id"]
        indexes = [
            models.Index(fields=["risk_band", "last_calculated_at"]),
        ]

    def __str__(self):
        return f"RiskProfile({self.customer_id}): {self.risk_band} [{self.risk_score}]"

class CustomerDispute(TimeStampedModel):
    """Customer dispute lifecycle — payment, delivery, product, billing, KYC."""

    dispute_ref = models.CharField(max_length=30, unique=True, db_index=True)
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE, related_name="disputes"
    )
    subscription = models.ForeignKey(
        "contracts.Subscription", on_delete=models.SET_NULL, null=True, blank=True, related_name="disputes"
    )
    dispute_type = models.CharField(
        max_length=30, choices=DisputeType.choices, db_index=True
    )
    subject = models.CharField(max_length=200)
    description = models.TextField()
    stage = models.CharField(
        max_length=20, choices=DisputeStage.choices, default=DisputeStage.OPEN, db_index=True
    )
    priority = models.CharField(
        max_length=10,
        choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High")],
        default="MEDIUM",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_disputes",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_disputes",
    )

    # SLA Timeline
    open_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for OPEN stage
    review_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for UNDER_REVIEW stage
    resolve_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for RESOLVED/REJECTED stage

    # Stage transitions
    review_started_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    resolution_notes = models.TextField(blank=True, default="")
    resolution_decision = models.TextField(blank=True, default="")  # Why it was resolved/rejected

    def save(self, *args, **kwargs):
        # Auto-set SLA deadlines on creation
        if not self.pk and not self.open_due_at:
            self.open_due_at = timezone.now() + timezone.timedelta(days=7)
            self.review_due_at = timezone.now() + timezone.timedelta(days=14)
            self.resolve_due_at = timezone.now() + timezone.timedelta(days=21)
        super().save(*args, **kwargs)

    class Meta:
        db_table = "subscriptions_customer_disputes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispute {self.dispute_ref} [{self.stage}] — {self.customer_id}"

    @property
    def is_sla_compliant(self) -> bool:
        """Check if dispute is on track with SLA."""
        now = timezone.now()
        if self.stage == DisputeStage.OPEN:
            return self.open_due_at is None or now <= self.open_due_at
        if self.stage == DisputeStage.UNDER_REVIEW:
            return self.review_due_at is None or now <= self.review_due_at
        return True  # RESOLVED, REJECTED, ESCALATED don't have active SLA

    @property
    def is_sla_breached(self) -> bool:
        """Check if SLA deadline has been missed."""
        now = timezone.now()
        if self.stage == DisputeStage.OPEN:
            return self.open_due_at is not None and now > self.open_due_at
        if self.stage == DisputeStage.UNDER_REVIEW:
            return self.review_due_at is not None and now > self.review_due_at
        return False

    @property
    def days_since_creation(self) -> int:
        """Days elapsed since dispute was created."""
        return (timezone.now() - self.created_at).days if self.created_at else 0

class PartnerCustomerKycRequestType(models.TextChoices):
    KYC_UPGRADE = "KYC_UPGRADE", "KYC Verification Request"
    LOGIN_ID_SETUP = "LOGIN_ID_SETUP", "Login ID Setup Request"
    KYC_DOCUMENT_UPLOAD = "KYC_DOCUMENT_UPLOAD", "KYC Document Upload Request"

class PartnerCustomerKycRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    MORE_INFO = "MORE_INFO", "More Information Needed"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"

class PartnerCustomerKycRequest(models.Model):
    """Partner-submitted request for admin to action a customer's KYC or login."""
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="customer_kyc_requests",
        db_index=True,
    )
    customer = models.ForeignKey("customers.Customer",
        on_delete=models.PROTECT,
        related_name="partner_kyc_requests",
        null=True,
        blank=True,
        db_index=True,
    )
    customer_name = models.CharField(max_length=200, blank=True, default="")
    customer_phone = models.CharField(max_length=20, blank=True, default="")
    request_type = models.CharField(
        max_length=30,
        choices=PartnerCustomerKycRequestType.choices,
        default=PartnerCustomerKycRequestType.KYC_UPGRADE,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=PartnerCustomerKycRequestStatus.choices,
        default=PartnerCustomerKycRequestStatus.PENDING,
        db_index=True,
    )
    admin_remarks = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_partner_kyc_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Physical table was created under the subscriptions app (migration 0128)
        # and moved to customers state-only; the db_table pin was lost in the
        # split, so the model looked for a non-existent customers_* table.
        db_table = "subscriptions_partnercustomerkycrequest"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        name = (
            (self.customer.name if self.customer_id else None)
            or self.customer_name
            or "Unknown"
        )
        return f"{self.request_type} — {name} ({self.status})"

class CustomerSupportRequest(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="support_requests",
    )
    payment = models.ForeignKey(
        "payments.Payment",
        on_delete=models.PROTECT,
        related_name="support_requests",
        null=True,
        blank=True,
    )
    subscription = models.ForeignKey(
        "contracts.Subscription",
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

class Address(models.Model):
    """Multiple addresses for customers, vendors, and partners"""
    
    ADDRESS_TYPE_CHOICES = [
        ('HOME', 'Home'),
        ('OFFICE', 'Office'),
        ('OTHER', 'Other'),
    ]
    
    # Link to customer or partner
    customer = models.ForeignKey("customers.Customer",
        on_delete=models.CASCADE,
        related_name='addresses',
        null=True,
        blank=True,
    )
    
    # Address fields
    address_type = models.CharField(
        max_length=10,
        choices=ADDRESS_TYPE_CHOICES,
        default='HOME'
    )
    line1 = models.CharField(max_length=200, help_text="Street address")
    line2 = models.CharField(max_length=200, blank=True, help_text="Apartment, suite, etc.")
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(
        max_length=6,
        validators=[PIN_VALIDATOR],
        db_index=True,
        help_text="6-digit postal index number"
    )
    country = models.CharField(max_length=100, default='India')
    
    # Geolocation
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True
    )
    
    # Flags
    is_primary = models.BooleanField(default=False)
    is_delivery_address = models.BooleanField(default=True)
    is_billing_address = models.BooleanField(default=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = "addresses"
        ordering = ["-is_primary", "-created_at"]
        indexes = [
            models.Index(fields=["customer", "is_primary"]),
            models.Index(fields=["postal_code"]),
            models.Index(fields=["city", "state"]),
        ]
    
    def __str__(self):
        return f"{self.line1}, {self.city} {self.postal_code}"

class KycReviewAction(models.Model):
    """Immutable audit record written for every KYC state transition.

    Works across all owner types. owner_type + owner_id identify the
    party; document_model + document_id identify the specific document (if
    the action applies to a single document rather than the overall KYC
    profile).
    """

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    owner_type = models.CharField(
        max_length=20,
        choices=KycOwnerType.choices,
        db_index=True,
    )
    owner_id = models.PositiveIntegerField(db_index=True)

    document_model = models.CharField(max_length=80, blank=True, default="")
    document_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    action = models.CharField(
        max_length=30,
        choices=KycReviewActionType.choices,
        db_index=True,
    )
    old_status = models.CharField(max_length=30, blank=True, default="")
    new_status = models.CharField(max_length=30, blank=True, default="")
    reason = models.TextField(blank=True, default="")

    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        blank=True,
        default="",
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="kyc_review_actions",
        null=True,
        blank=True,
    )

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "kyc_review_actions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["owner_type", "owner_id", "created_at"]),
            models.Index(fields=["owner_type", "action"]),
            models.Index(fields=["document_model", "document_id"]),
        ]

    def save(self, *args, **kwargs):
        self.reason = (self.reason or "").strip()
        self.document_model = (self.document_model or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"KycReviewAction[{self.owner_type}#{self.owner_id}] "
            f"{self.action} by {self.performed_by_id}"
        )

class PartnerKycDocumentStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    PENDING = "PENDING", "Pending Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    RESUBMISSION_REQUIRED = "RESUBMISSION_REQUIRED", "Resubmission Required"

class PartnerKycDocumentType(models.TextChoices):
    AADHAAR = "AADHAAR", "Aadhaar Card"
    PAN = "PAN", "PAN Card"
    PASSPORT = "PASSPORT", "Passport"
    DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
    VOTER_ID = "VOTER_ID", "Voter ID"
    GST_CERTIFICATE = "GST_CERTIFICATE", "GST Certificate"
    BANK_PROOF = "BANK_PROOF", "Bank Proof"
    OTHER = "OTHER", "Other"

def partner_kyc_doc_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower() or ".bin"
    partner_id = getattr(instance, "partner_user_id", None)
    doc_type = (getattr(instance, "document_type", "") or "KYC").strip().lower()
    token = uuid4().hex[:12]
    identity = f"partner-{partner_id}" if partner_id else "partner"
    return f"partners/kyc/{identity}/{doc_type}-{token}{extension}"

class PartnerKycDocument(models.Model):
    """KYC document uploaded for a partner user (role=PARTNER)."""

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    partner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_kyc_documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentType.choices,
        default=PartnerKycDocumentType.OTHER,
        db_index=True,
    )
    category = models.CharField(max_length=30, blank=True, default="", db_index=True)
    document_reference = models.CharField(max_length=80, blank=True, default="")
    file = models.FileField(upload_to=partner_kyc_doc_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentStatus.choices,
        default=PartnerKycDocumentStatus.SUBMITTED,
        db_index=True,
    )
    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        default=KycUploadSource.ADMIN_UPLOAD,
        blank=True,
        db_index=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_partner_kyc_documents",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_partner_kyc_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Document expiry date. Leave blank for non-expiring documents.",
    )
    rejection_reason = models.TextField(blank=True, default="")
    resubmission_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
    )

    class Meta:
        db_table = "partner_kyc_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["partner_user", "status"]),
            models.Index(fields=["partner_user", "document_type"]),
        ]

    def clean(self):
        errors = {}
        if not self.partner_user_id:
            errors["partner_user"] = "Partner user is required."
        if not self.file:
            errors["file"] = "Document file is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.file:
            self.original_filename = (
                self.original_filename or Path(getattr(self.file, "name", "")).name
            )[:255]
            self.file_size = int(getattr(self.file, "size", None) or self.file_size or 0)
            ct = getattr(self.file, "content_type", "") or ""
            if ct:
                self.content_type = ct[:100]
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.document_reference = (self.document_reference or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"PartnerKYC {self.document_type} for user {self.partner_user_id} [{self.status}]"
        )



# --- Folded from subscriptions (Phase D of the split): address reference data
#     (ServiceZone, PincodeDatabase). KYC workflow enums/helpers already live in
#     this module (customers absorbed KYC in a prior split), so nothing to fold
#     there — the subscriptions shim re-exports them from here. ---
from customers.models_address import *  # noqa: E402,F401,F403


# --- Folded from subscriptions (Phase G): AML screening. ---
from customers.models_aml import *  # noqa: E402,F401,F403
