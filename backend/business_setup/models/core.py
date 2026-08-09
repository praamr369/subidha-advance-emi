"""Business-setup domain models (split out of the subscriptions app, Phase B).

Config/organization models: business profile, public site, policies, brand
import, compliance documents, backup/restore jobs. Tables keep their original
names so the move is state-only (see business_setup/migrations/0001_initial).

NOTE: the legacy duplicate models Branch/FinanceAccount/CashDesk/ChartAccount/
StaffOperationalAssignment were NOT moved here — they were dead (0 rows,
superseded by accounting.FinanceAccount + branch_control.Branch) and are dropped
in subscriptions/migrations 0142.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from pathlib import Path
from uuid import uuid4


class BusinessSetupTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def business_compliance_document_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if not extension:
        extension = ".bin"
    doc_type = (getattr(instance, "document_type", "") or "other").strip().lower()
    token = uuid4().hex[:12]
    return f"business/compliance/{doc_type}/{doc_type}-{token}{extension}"


class BusinessProfile(BusinessSetupTimeStampedModel):
    legal_name = models.CharField(max_length=255)
    trade_name = models.CharField(max_length=255, blank=True, default="")
    business_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    primary_email = models.EmailField(blank=True, default="")
    primary_phone = models.CharField(max_length=20, blank=True, default="")
    alternate_phone = models.CharField(max_length=20, blank=True, default="")
    website_url = models.URLField(blank=True, default="")
    address_line_1 = models.CharField(max_length=255, blank=True, default="")
    address_line_2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=80, default="India")
    gstin = models.CharField(max_length=32, blank=True, default="")
    pan_number = models.CharField(max_length=32, blank=True, default="")

    # Additional Indian statutory identifiers
    cin_number = models.CharField(max_length=21, blank=True, default="", help_text="Company Identification Number (Pvt Ltd / LLP only). Printed on letterheads under Companies Act 2013.")
    tan_number = models.CharField(max_length=10, blank=True, default="", help_text="Tax Deduction Account Number. Required if the business deducts TDS.")
    udyam_number = models.CharField(max_length=20, blank=True, default="", help_text="Udyam / MSME Registration Number (e.g. UDYAM-MH-00-0000000).")
    trade_license_number = models.CharField(max_length=64, blank=True, default="", help_text="Trade License issued by the local municipal authority.")
    shop_act_number = models.CharField(max_length=64, blank=True, default="", help_text="Shop & Establishment Act registration number (Shops Act license).")

    # Business classification
    class BusinessType(models.TextChoices):
        SOLE_PROPRIETORSHIP = "SOLE_PROPRIETORSHIP", "Sole Proprietorship"
        PARTNERSHIP = "PARTNERSHIP", "Partnership Firm"
        LLP = "LLP", "Limited Liability Partnership (LLP)"
        PRIVATE_LIMITED = "PRIVATE_LIMITED", "Private Limited Company"
        OPC = "OPC", "One Person Company (OPC)"
        PUBLIC_LIMITED = "PUBLIC_LIMITED", "Public Limited Company"
        HUF = "HUF", "Hindu Undivided Family (HUF)"

    business_type = models.CharField(max_length=32, choices=BusinessType.choices, blank=True, default="")
    year_of_establishment = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Year the business was established (e.g. 2010). Printed on letterheads.")

    # Authorized signatory (for invoices, agreements, and legal documents)
    authorized_signatory_name = models.CharField(max_length=120, blank=True, default="", help_text="Full name of the person authorized to sign invoices and legal documents.")
    authorized_signatory_designation = models.CharField(max_length=80, blank=True, default="", help_text="Designation of the signatory (e.g. Proprietor, Director, Partner).")

    # Banking details (printed on B2B invoices for NEFT/RTGS/UPI payments)
    bank_name = models.CharField(max_length=120, blank=True, default="")
    bank_account_number = models.CharField(max_length=32, blank=True, default="")
    bank_ifsc_code = models.CharField(max_length=11, blank=True, default="")
    bank_branch = models.CharField(max_length=120, blank=True, default="")
    upi_id = models.CharField(max_length=80, blank=True, default="", help_text="UPI ID for QR / payment link on receipts (e.g. businessname@upi).")

    invoice_prefix = models.CharField(max_length=20, blank=True, default="")
    receipt_prefix = models.CharField(max_length=20, blank=True, default="")
    default_currency_code = models.CharField(max_length=10, default="INR")
    timezone_name = models.CharField(max_length=64, default="Asia/Kolkata")
    logo_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "business_profiles"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}
        if not (self.legal_name or "").strip():
            errors["legal_name"] = "Legal name is required."
        if self.is_active and BusinessProfile.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active business profile is allowed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.legal_name = (self.legal_name or "").strip()
        self.trade_name = (self.trade_name or "").strip()
        self.business_code = (self.business_code or "").strip().upper()
        self.primary_phone = (self.primary_phone or "").strip()
        self.alternate_phone = (self.alternate_phone or "").strip()
        self.address_line_1 = (self.address_line_1 or "").strip()
        self.address_line_2 = (self.address_line_2 or "").strip()
        self.landmark = (self.landmark or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.postal_code = (self.postal_code or "").strip()
        self.country = (self.country or "").strip() or "India"
        self.gstin = (self.gstin or "").strip().upper()
        self.pan_number = (self.pan_number or "").strip().upper()
        self.cin_number = (self.cin_number or "").strip().upper()
        self.tan_number = (self.tan_number or "").strip().upper()
        self.udyam_number = (self.udyam_number or "").strip().upper()
        self.trade_license_number = (self.trade_license_number or "").strip()
        self.shop_act_number = (self.shop_act_number or "").strip()
        self.bank_ifsc_code = (self.bank_ifsc_code or "").strip().upper()
        self.bank_account_number = (self.bank_account_number or "").strip()
        self.upi_id = (self.upi_id or "").strip()
        self.authorized_signatory_name = (self.authorized_signatory_name or "").strip()
        self.authorized_signatory_designation = (self.authorized_signatory_designation or "").strip()
        self.invoice_prefix = (self.invoice_prefix or "").strip().upper()
        self.receipt_prefix = (self.receipt_prefix or "").strip().upper()
        self.default_currency_code = (self.default_currency_code or "").strip().upper() or "INR"
        self.timezone_name = (self.timezone_name or "").strip() or "Asia/Kolkata"
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.trade_name or self.legal_name


class PlanLegalClassification(models.TextChoices):
    PRODUCT_INSTALLMENT = "PRODUCT_INSTALLMENT", "Product Instalment"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    RENTAL = "RENTAL", "Rental"
    LEASE = "LEASE", "Lease"


class BenefitType(models.TextChoices):
    NONE = "NONE", "None"
    CONTRACTUAL_WAIVER = "CONTRACTUAL_WAIVER", "Contractual Waiver"
    TRADE_DISCOUNT = "TRADE_DISCOUNT", "Trade Discount"
    PROMOTIONAL_CREDIT = "PROMOTIONAL_CREDIT", "Promotional Credit"


class SelectionMethod(models.TextChoices):
    NONE = "NONE", "None"
    HASH_FAIRNESS = "HASH_FAIRNESS", "Hash Fairness"
    ADMIN_APPROVED = "ADMIN_APPROVED", "Admin Approved"
    PERFORMANCE_BASED = "PERFORMANCE_BASED", "Performance Based"


class BenefitFundingSource(models.TextChoices):
    COMPANY_MARGIN = "COMPANY_MARGIN", "Company Margin"
    CUSTOMER_POOL_BLOCKED = "CUSTOMER_POOL_BLOCKED", "Customer Pool Blocked"


class LegalRiskStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    CA_REVIEW_REQUIRED = "CA_REVIEW_REQUIRED", "CA Review Required"
    ADVOCATE_REVIEW_REQUIRED = "ADVOCATE_REVIEW_REQUIRED", "Advocate Review Required"
    APPROVED_FOR_INTERNAL_TEST = "APPROVED_FOR_INTERNAL_TEST", "Approved For Internal Test"
    APPROVED_FOR_PUBLIC_LAUNCH = "APPROVED_FOR_PUBLIC_LAUNCH", "Approved For Public Launch"
    BLOCKED = "BLOCKED", "Blocked"


def default_non_gst_document_labels() -> list[str]:
    return [
        "Retail Bill",
        "Sale Bill",
        "Money Receipt",
        "Plan Receipt",
        "Security Deposit Receipt",
        "Commercial Waiver Note",
        "Commercial Credit Note",
        "Refund Record",
    ]


class BusinessRulePolicy(BusinessSetupTimeStampedModel):
    """
    DB-backed legal/CA/business-rule settings for launch gates.

    This table records operating policy only. It must not post money, create
    receipts, generate invoices, or mutate EMI/payment history.
    """

    name = models.CharField(max_length=120, default="Default legal controls")
    is_active = models.BooleanField(default=True, db_index=True)
    plan_type = models.CharField(
        max_length=40,
        choices=PlanLegalClassification.choices,
        default=PlanLegalClassification.PRODUCT_INSTALLMENT,
        db_index=True,
    )
    benefit_type = models.CharField(
        max_length=40,
        choices=BenefitType.choices,
        default=BenefitType.CONTRACTUAL_WAIVER,
    )
    selection_method = models.CharField(
        max_length=40,
        choices=SelectionMethod.choices,
        default=SelectionMethod.HASH_FAIRNESS,
    )
    funding_source = models.CharField(
        max_length=40,
        choices=BenefitFundingSource.choices,
        default=BenefitFundingSource.COMPANY_MARGIN,
    )
    risk_status = models.CharField(
        max_length=40,
        choices=LegalRiskStatus.choices,
        default=LegalRiskStatus.ADVOCATE_REVIEW_REQUIRED,
        db_index=True,
    )
    refund_sla_working_days = models.PositiveSmallIntegerField(default=7)
    late_payment_charge_enabled = models.BooleanField(default=False)
    late_payment_charge_configured = models.BooleanField(default=False)
    late_payment_charge_label = models.CharField(max_length=80, default="Late Payment Charge")
    partner_receipt_admin_approval_required = models.BooleanField(default=True)
    kyc_masking_required = models.BooleanField(default=True)
    deposit_refund_requires_inspection = models.BooleanField(default=True)
    gst_documents_require_hsn_sac = models.BooleanField(default=True)
    non_gst_document_labels = models.JSONField(default=default_non_gst_document_labels, blank=True)
    notes = models.TextField(blank=True, default="")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_business_rule_policies",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "business_rule_policies"
        ordering = ["-is_active", "-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=models.Q(is_active=True),
                name="unique_active_business_rule_policy",
            ),
            models.CheckConstraint(
                condition=models.Q(refund_sla_working_days__gte=1),
                name="chk_business_rule_refund_sla_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["risk_status", "is_active"], name="business_ru_risk_st_440138_idx"),
            models.Index(fields=["plan_type", "risk_status"], name="business_ru_plan_ty_1b933e_idx"),
        ]

    def clean(self):
        errors = {}
        self.name = (self.name or "").strip() or "Default legal controls"
        self.late_payment_charge_label = (self.late_payment_charge_label or "").strip()
        self.notes = (self.notes or "").strip()
        if self.is_active and BusinessRulePolicy.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active business rule policy is allowed."
        if self.funding_source == BenefitFundingSource.CUSTOMER_POOL_BLOCKED:
            errors["funding_source"] = "Customer pool funding is blocked for Lucky Plan classification."
        forbidden_label_terms = {"penalty", "punishment", "fine"}
        if any(term in self.late_payment_charge_label.lower() for term in forbidden_label_terms):
            errors["late_payment_charge_label"] = "Use 'Late Payment Charge' wording; penalty/punishment/fine wording is not allowed."
        if self.late_payment_charge_enabled and not self.late_payment_charge_configured:
            errors["late_payment_charge_configured"] = "Late payment charge must be configured before it can be enabled."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip() or "Default legal controls"
        self.notes = (self.notes or "").strip()
        self.late_payment_charge_label = (self.late_payment_charge_label or "").strip() or "Late Payment Charge"
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} [{self.risk_status}]"


class PublicBusinessProfile(BusinessSetupTimeStampedModel):
    """
    Public-facing business identity and contact settings.

    Intentionally separated from BusinessProfile so public pages never need to
    depend on internal-only fields (GSTIN, PAN, document prefixes, etc).
    """

    display_name = models.CharField(max_length=255, blank=True, default="")
    tagline = models.CharField(max_length=255, blank=True, default="")
    hero_title = models.CharField(max_length=255, blank=True, default="")
    hero_subtitle = models.TextField(blank=True, default="")

    support_phone = models.CharField(max_length=20, blank=True, default="")
    support_email = models.EmailField(blank=True, default="")

    whatsapp_phone = models.CharField(max_length=20, blank=True, default="")
    whatsapp_link = models.URLField(blank=True, default="")

    facebook_url = models.URLField(blank=True, default="")
    instagram_url = models.URLField(blank=True, default="")
    youtube_url = models.URLField(blank=True, default="")

    address_text = models.TextField(blank=True, default="")
    map_url = models.URLField(blank=True, default="")
    business_hours = models.TextField(blank=True, default="")

    public_logo_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "public_business_profiles"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}

        if self.is_active and PublicBusinessProfile.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active public business profile is allowed."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()
        self.tagline = (self.tagline or "").strip()
        self.hero_title = (self.hero_title or "").strip()
        self.hero_subtitle = (self.hero_subtitle or "").strip()
        self.support_phone = (self.support_phone or "").strip()
        self.support_email = (self.support_email or "").strip()
        self.whatsapp_phone = (self.whatsapp_phone or "").strip()
        self.whatsapp_link = (self.whatsapp_link or "").strip()
        self.facebook_url = (self.facebook_url or "").strip()
        self.instagram_url = (self.instagram_url or "").strip()
        self.youtube_url = (self.youtube_url or "").strip()
        self.address_text = (self.address_text or "").strip()
        self.map_url = (self.map_url or "").strip()
        self.business_hours = (self.business_hours or "").strip()
        self.public_logo_url = (self.public_logo_url or "").strip()

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name or "Public Business Profile"


class PolicyCategory(models.TextChoices):
    GENERAL = "GENERAL", "General"
    PRIVACY = "PRIVACY", "Privacy"
    REFUND = "REFUND", "Refund / Cancellation"
    WARRANTY = "WARRANTY", "Warranty"
    DELIVERY = "DELIVERY", "Delivery"
    RENT_LEASE = "RENT_LEASE", "Rental / Lease"
    LUCKY_PLAN = "LUCKY_PLAN", "Lucky Plan EMI"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    PAYMENT = "PAYMENT", "Payment"
    SERVICE = "SERVICE", "Service / Repair"
    GRIEVANCE = "GRIEVANCE", "Grievance"
    COMPLIANCE = "COMPLIANCE", "Compliance"
    CUSTOMER_SUPPORT = "CUSTOMER_SUPPORT", "Customer Support"


class PolicyStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PUBLISHED = "PUBLISHED", "Published"
    ARCHIVED = "ARCHIVED", "Archived"


class PolicyPage(BusinessSetupTimeStampedModel):
    slug = models.SlugField(max_length=120, db_index=True)
    version = models.PositiveIntegerField(default=1)
    category = models.CharField(max_length=40, choices=PolicyCategory.choices, default=PolicyCategory.GENERAL, db_index=True)
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True, default="")
    content = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=PolicyStatus.choices, default=PolicyStatus.DRAFT, db_index=True)
    effective_date = models.DateField(null=True, blank=True, db_index=True)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="published_policy_pages",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_policy_pages",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_policy_pages",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "policy_pages"
        ordering = ["slug", "-version", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["slug", "version"], name="unique_policy_slug_version"),
            models.UniqueConstraint(
                fields=["slug"],
                condition=models.Q(status=PolicyStatus.PUBLISHED),
                name="unique_published_policy_slug",
            ),
        ]
        indexes = [
            models.Index(fields=["slug", "status"]),
            models.Index(fields=["category", "status"]),
        ]

    def clean(self):
        errors = {}
        self.slug = (self.slug or "").strip().lower()
        self.title = (self.title or "").strip()
        self.summary = (self.summary or "").strip()
        self.content = (self.content or "").strip()
        if not self.slug:
            errors["slug"] = "Policy slug is required."
        if not self.title:
            errors["title"] = "Policy title is required."
        if self.version < 1:
            errors["version"] = "Version must be at least 1."
        if self.status == PolicyStatus.PUBLISHED:
            if not self.published_at:
                errors["published_at"] = "Published policies require a published_at timestamp."
            if not self.effective_date:
                errors["effective_date"] = "Published policies require an effective date."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.slug = (self.slug or "").strip().lower()
        self.title = (self.title or "").strip()
        self.summary = (self.summary or "").strip()
        self.content = (self.content or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.slug} v{self.version} [{self.status}]"


class BusinessComplianceDocumentType(models.TextChoices):
    RENTAL_AGREEMENT = "RENTAL_AGREEMENT", "Rental Agreement"
    OWNERSHIP_PROOF = "OWNERSHIP_PROOF", "Ownership Proof"
    UDYAM_CERTIFICATE = "UDYAM_CERTIFICATE", "Udyam Certificate"
    GST_CERTIFICATE = "GST_CERTIFICATE", "GST Certificate"
    SHOP_LICENSE = "SHOP_LICENSE", "Shop License"
    BANK_PROOF = "BANK_PROOF", "Bank Proof"
    PAN_OR_TAX_PROOF = "PAN_OR_TAX_PROOF", "PAN/Tax Proof"
    # Legal advisor / CA documents (internal records only)
    CA_OPINION = "CA_OPINION", "CA Written Opinion"
    ADVOCATE_OPINION = "ADVOCATE_OPINION", "Advocate Legal Opinion"
    LEGAL_NOTICE = "LEGAL_NOTICE", "Legal Notice"
    COURT_ORDER = "COURT_ORDER", "Court Order / Judgment"
    LEGAL_AGREEMENT = "LEGAL_AGREEMENT", "Signed Legal Agreement / Contract"
    SCHEME_APPROVAL_LETTER = "SCHEME_APPROVAL_LETTER", "Scheme Approval Letter"
    OTHER = "OTHER", "Other"


class BusinessComplianceDocumentVisibility(models.TextChoices):
    PRIVATE = "PRIVATE", "Private"
    PUBLIC_SUMMARY_ONLY = "PUBLIC_SUMMARY_ONLY", "Public Summary Only"


class BusinessComplianceDocumentVerificationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VERIFIED = "VERIFIED", "Verified"
    REJECTED = "REJECTED", "Rejected"
    NOT_PROVIDED = "NOT_PROVIDED", "Not Provided"


class BusinessComplianceDocument(BusinessSetupTimeStampedModel):
    document_type = models.CharField(max_length=40, choices=BusinessComplianceDocumentType.choices, db_index=True)
    title = models.CharField(max_length=255, blank=True, default="")
    file = models.FileField(upload_to=business_compliance_document_upload_to, null=True, blank=True)
    public_visibility = models.CharField(
        max_length=24,
        choices=BusinessComplianceDocumentVisibility.choices,
        default=BusinessComplianceDocumentVisibility.PRIVATE,
        db_index=True,
    )
    verification_status = models.CharField(
        max_length=20,
        choices=BusinessComplianceDocumentVerificationStatus.choices,
        default=BusinessComplianceDocumentVerificationStatus.PENDING,
        db_index=True,
    )
    public_summary = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_business_compliance_documents",
        null=True,
        blank=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviewed_business_compliance_documents",
        null=True,
        blank=True,
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "business_compliance_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["document_type", "verification_status"]),
            models.Index(fields=["public_visibility", "verification_status"]),
        ]

    def clean(self):
        errors = {}
        self.title = (self.title or "").strip()
        self.public_summary = (self.public_summary or "").strip()
        self.notes = (self.notes or "").strip()
        if (
            self.public_visibility == BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY
            and not self.public_summary
        ):
            errors["public_summary"] = "Public summary is required when visibility is public summary only."
        if self.verification_status == BusinessComplianceDocumentVerificationStatus.VERIFIED and not self.verified_at:
            self.verified_at = timezone.now()
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.title = (self.title or "").strip()
        self.public_summary = (self.public_summary or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.document_type} [{self.verification_status}]"


class BrandDataSource(BusinessSetupTimeStampedModel):
    class Provider(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        GOOGLE_BUSINESS = "GOOGLE_BUSINESS", "Google Business Profile"
        YOUTUBE = "YOUTUBE", "YouTube"
        FACEBOOK = "FACEBOOK", "Facebook"
        JUSTDIAL = "JUSTDIAL", "Justdial"
        OTHER = "OTHER", "Other"

    provider = models.CharField(max_length=40, choices=Provider.choices, db_index=True)
    name = models.CharField(max_length=120)
    is_configured = models.BooleanField(default=False, db_index=True)
    configuration_hint = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "brand_data_sources"
        ordering = ["provider", "id"]


class BrandImportBatch(BusinessSetupTimeStampedModel):
    class Status(models.TextChoices):
        PREVIEW = "PREVIEW", "Preview"
        REVIEWED = "REVIEWED", "Reviewed"
        APPLIED = "APPLIED", "Applied"
        CANCELLED = "CANCELLED", "Cancelled"

    source = models.ForeignKey(BrandDataSource, on_delete=models.PROTECT, related_name="import_batches")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PREVIEW, db_index=True)
    imported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="brand_import_batches")
    payload_snapshot = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "brand_import_batches"
        ordering = ["-created_at", "-id"]


class BrandImportedItem(BusinessSetupTimeStampedModel):
    class ItemType(models.TextChoices):
        BRAND_IDENTITY = "BRAND_IDENTITY", "Brand Identity"
        CONTACT_LOCATION = "CONTACT_LOCATION", "Contact & Location"
        SOCIAL_LINK = "SOCIAL_LINK", "Social Link"
        MEDIA_ASSET = "MEDIA_ASSET", "Media Asset"
        PUBLIC_CONTENT = "PUBLIC_CONTENT", "Public Content"

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        APPLIED = "APPLIED", "Applied"

    batch = models.ForeignKey(BrandImportBatch, on_delete=models.PROTECT, related_name="items")
    item_type = models.CharField(max_length=30, choices=ItemType.choices, db_index=True)
    field_key = models.CharField(max_length=80, db_index=True)
    value = models.JSONField(default=dict, blank=True)
    approval_status = models.CharField(max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_brand_import_items",
        null=True,
        blank=True,
    )
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="rejected_brand_import_items",
        null=True,
        blank=True,
    )
    review_note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "brand_imported_items"
        ordering = ["-created_at", "-id"]


class BrandProfileSnapshot(BusinessSetupTimeStampedModel):
    source_batch = models.ForeignKey(BrandImportBatch, on_delete=models.PROTECT, related_name="snapshots", null=True, blank=True)
    profile_payload = models.JSONField(default=dict, blank=True)
    applied_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="brand_profile_snapshots")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "brand_profile_snapshots"
        ordering = ["-created_at", "-id"]


class SocialLink(BusinessSetupTimeStampedModel):
    class Platform(models.TextChoices):
        FACEBOOK = "FACEBOOK", "Facebook"
        YOUTUBE = "YOUTUBE", "YouTube"
        INSTAGRAM = "INSTAGRAM", "Instagram"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        JUSTDIAL = "JUSTDIAL", "Justdial"
        WEBSITE = "WEBSITE", "Website"
        OTHER = "OTHER", "Other"

    platform = models.CharField(max_length=30, choices=Platform.choices, db_index=True)
    label = models.CharField(max_length=120, blank=True, default="")
    url = models.URLField()
    is_active = models.BooleanField(default=True, db_index=True)
    is_public = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "brand_social_links"
        ordering = ["platform", "id"]


class BusinessMediaAsset(BusinessSetupTimeStampedModel):
    class AssetType(models.TextChoices):
        LOGO = "LOGO", "Logo"
        STOREFRONT = "STOREFRONT", "Storefront"
        GALLERY = "GALLERY", "Gallery"
        VIDEO = "VIDEO", "Video"
        OTHER = "OTHER", "Other"

    asset_type = models.CharField(max_length=30, choices=AssetType.choices, db_index=True)
    title = models.CharField(max_length=255, blank=True, default="")
    media_url = models.URLField()
    source_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    is_public = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "business_media_assets"
        ordering = ["-created_at", "-id"]


class PublicContentBlock(BusinessSetupTimeStampedModel):
    key = models.CharField(max_length=120, unique=True)
    title = models.CharField(max_length=255, blank=True, default="")
    content = models.TextField(blank=True, default="")
    source_batch = models.ForeignKey(BrandImportBatch, on_delete=models.PROTECT, related_name="content_blocks", null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_public = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "public_content_blocks"
        ordering = ["key", "id"]


class BusinessDataBackupJob(BusinessSetupTimeStampedModel):
    class JobType(models.TextChoices):
        FULL_DATABASE_LOGICAL = "FULL_DATABASE_LOGICAL", "Full database logical"
        SELECTED_SCOPES_EXPORT = "SELECTED_SCOPES_EXPORT", "Selected scopes export"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    job_type = models.CharField(max_length=40, choices=JobType.choices, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_business_backup_jobs",
    )
    scopes = models.JSONField(default=list)
    file_path = models.CharField(max_length=500, blank=True, default="")
    checksum = models.CharField(max_length=128, blank=True, default="")
    row_counts = models.JSONField(default=dict)
    metadata = models.JSONField(default=dict)
    error_message = models.TextField(blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "business_data_backup_jobs"
        ordering = ["-created_at", "-id"]


class BusinessDataRestoreJob(BusinessSetupTimeStampedModel):
    class Status(models.TextChoices):
        PREVIEWED = "PREVIEWED", "Previewed"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PREVIEWED, db_index=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_business_restore_jobs",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_business_restore_jobs",
        null=True,
        blank=True,
    )
    backup_job = models.ForeignKey(
        "business_setup.BusinessDataBackupJob",
        on_delete=models.PROTECT,
        related_name="restore_jobs",
    )
    package_type = models.CharField(max_length=64, blank=True, default="")
    package_checksum = models.CharField(max_length=128, blank=True, default="")
    selected_scopes = models.JSONField(default=list)
    preview = models.JSONField(default=dict)
    error_message = models.TextField(blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "business_data_restore_jobs"
        ordering = ["-created_at", "-id"]
