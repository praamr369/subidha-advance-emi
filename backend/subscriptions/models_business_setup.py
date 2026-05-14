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


class BranchType(models.TextChoices):
    HEAD_OFFICE = "HEAD_OFFICE", "Head Office"
    BRANCH = "BRANCH", "Branch"
    WAREHOUSE = "WAREHOUSE", "Warehouse"
    COLLECTION_POINT = "COLLECTION_POINT", "Collection Point"


class FinanceAccountType(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"
    OTHER = "OTHER", "Other"


class CashDeskType(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"
    MIXED = "MIXED", "Mixed"


class StaffOperationalRoleScope(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    CASHIER = "CASHIER", "Cashier"
    PARTNER = "PARTNER", "Partner"
    MANAGER = "MANAGER", "Manager"
    FINANCE_REVIEWER = "FINANCE_REVIEWER", "Finance Reviewer"


class ChartAccountCategory(models.TextChoices):
    ASSET = "ASSET", "Asset"
    LIABILITY = "LIABILITY", "Liability"
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"
    EQUITY = "EQUITY", "Equity"


class ChartAccountGroup(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    RECEIVABLE = "RECEIVABLE", "Receivable"
    PAYABLE = "PAYABLE", "Payable"
    REVENUE = "REVENUE", "Revenue"
    COMMISSION = "COMMISSION", "Commission"
    WAIVER = "WAIVER", "Waiver"
    TAX = "TAX", "Tax"
    EXPENSE = "EXPENSE", "Expense"
    SUSPENSE = "SUSPENSE", "Suspense"
    EQUITY = "EQUITY", "Equity"


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
        self.invoice_prefix = (self.invoice_prefix or "").strip().upper()
        self.receipt_prefix = (self.receipt_prefix or "").strip().upper()
        self.default_currency_code = (self.default_currency_code or "").strip().upper() or "INR"
        self.timezone_name = (self.timezone_name or "").strip() or "Asia/Kolkata"
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.trade_name or self.legal_name


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


class Branch(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    branch_type = models.CharField(max_length=30, choices=BranchType.choices, default=BranchType.BRANCH, db_index=True)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    manager_name = models.CharField(max_length=120, blank=True, default="")
    address_line_1 = models.CharField(max_length=255, blank=True, default="")
    address_line_2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=80, default="India")
    is_head_office = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    opened_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "branches"
        ordering = ["name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Branch code is required."
        if not (self.name or "").strip():
            errors["name"] = "Branch name is required."
        if self.is_active and self.is_head_office:
            if Branch.objects.filter(is_active=True, is_head_office=True).exclude(pk=self.pk).exists():
                errors["is_head_office"] = "Only one active head office branch is allowed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.manager_name = (self.manager_name or "").strip()
        self.address_line_1 = (self.address_line_1 or "").strip()
        self.address_line_2 = (self.address_line_2 or "").strip()
        self.landmark = (self.landmark or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.postal_code = (self.postal_code or "").strip()
        self.country = (self.country or "").strip() or "India"
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class FinanceAccount(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=10, choices=FinanceAccountType.choices, default=FinanceAccountType.CASH, db_index=True)
    account_holder_name = models.CharField(max_length=255, blank=True, default="")
    provider_name = models.CharField(max_length=255, blank=True, default="")
    bank_name = models.CharField(max_length=255, blank=True, default="")
    branch_name = models.CharField(max_length=255, blank=True, default="")
    masked_account_number = models.CharField(max_length=64, blank=True, default="")
    ifsc_code = models.CharField(max_length=32, blank=True, default="")
    upi_handle = models.CharField(max_length=128, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "finance_accounts"
        ordering = ["name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Finance account code is required."
        if not (self.name or "").strip():
            errors["name"] = "Finance account name is required."
        if self.account_type == FinanceAccountType.UPI and not (self.upi_handle or "").strip():
            errors["upi_handle"] = "UPI handle is required for UPI finance accounts."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.account_holder_name = (self.account_holder_name or "").strip()
        self.provider_name = (self.provider_name or "").strip()
        self.bank_name = (self.bank_name or "").strip()
        self.branch_name = (self.branch_name or "").strip()
        self.masked_account_number = (self.masked_account_number or "").strip()
        self.ifsc_code = (self.ifsc_code or "").strip().upper()
        self.upi_handle = (self.upi_handle or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class CashDesk(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="cash_desks")
    desk_type = models.CharField(max_length=10, choices=CashDeskType.choices, default=CashDeskType.CASH, db_index=True)
    default_finance_account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name="cash_desks")
    allow_cash_collection = models.BooleanField(default=True)
    allow_bank_collection = models.BooleanField(default=False)
    allow_upi_collection = models.BooleanField(default=False)
    receipt_printer_name = models.CharField(max_length=255, blank=True, default="")
    device_label = models.CharField(max_length=255, blank=True, default="")
    is_default_for_branch = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "cash_desks"
        ordering = ["branch_id", "name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Cash desk code is required."
        if not (self.name or "").strip():
            errors["name"] = "Cash desk name is required."
        if self.default_finance_account_id and not self.default_finance_account.is_active:
            errors["default_finance_account"] = "Default finance account must be active."
        if self.desk_type == CashDeskType.CASH and not self.allow_cash_collection:
            errors["desk_type"] = "Cash desk must allow cash collection."
        if self.desk_type == CashDeskType.BANK and not self.allow_bank_collection:
            errors["desk_type"] = "Bank desk must allow bank collection."
        if self.desk_type == CashDeskType.UPI and not self.allow_upi_collection:
            errors["desk_type"] = "UPI desk must allow UPI collection."
        if self.desk_type == CashDeskType.MIXED and not any([self.allow_cash_collection, self.allow_bank_collection, self.allow_upi_collection]):
            errors["desk_type"] = "Mixed desk must allow at least one collection method."
        if self.is_active and self.is_default_for_branch:
            if CashDesk.objects.filter(branch=self.branch, is_active=True, is_default_for_branch=True).exclude(pk=self.pk).exists():
                errors["is_default_for_branch"] = "Only one active default cash desk is allowed per branch."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.receipt_printer_name = (self.receipt_printer_name or "").strip()
        self.device_label = (self.device_label or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.branch.code} - {self.name}"


class StaffOperationalAssignment(BusinessSetupTimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="operational_assignments")
    role_scope = models.CharField(max_length=30, choices=StaffOperationalRoleScope.choices, default=StaffOperationalRoleScope.CASHIER, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="staff_operational_assignments")
    default_cash_desk = models.ForeignKey(CashDesk, on_delete=models.PROTECT, related_name="staff_operational_assignments", null=True, blank=True)
    can_collect_payments = models.BooleanField(default=False)
    can_verify_payments = models.BooleanField(default=False)
    can_manage_branches = models.BooleanField(default=False)
    can_manage_cash_desks = models.BooleanField(default=False)
    can_manage_finance_accounts = models.BooleanField(default=False)
    can_manage_chart_accounts = models.BooleanField(default=False)
    can_run_go_live_reset = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    effective_from = models.DateField(default=timezone.localdate)
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "staff_operational_assignments"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}
        if self.default_cash_desk_id and self.default_cash_desk.branch_id != self.branch_id:
            errors["default_cash_desk"] = "Default cash desk must belong to the same branch."
        if self.is_active and self.is_primary:
            if StaffOperationalAssignment.objects.filter(user=self.user, is_active=True, is_primary=True).exclude(pk=self.pk).exists():
                errors["is_primary"] = "Only one active primary assignment is allowed per user."
        if self.effective_to and self.effective_to < self.effective_from:
            errors["effective_to"] = "Effective to date cannot be earlier than effective from date."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user_id} - {self.branch.code} - {self.role_scope}"


class ChartAccount(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    account_category = models.CharField(max_length=20, choices=ChartAccountCategory.choices, db_index=True)
    account_group = models.CharField(max_length=20, choices=ChartAccountGroup.choices, db_index=True)
    parent = models.ForeignKey("self", on_delete=models.PROTECT, related_name="children", null=True, blank=True)
    description = models.TextField(blank=True, default="")
    is_system = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    allow_manual_posting = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "chart_accounts"
        ordering = ["display_order", "code", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Chart account code is required."
        if not (self.name or "").strip():
            errors["name"] = "Chart account name is required."
        if self.parent_id and self.parent_id == self.pk:
            errors["parent"] = "Chart account cannot be its own parent."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


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
        "subscriptions.BusinessDataBackupJob",
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
