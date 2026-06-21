from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from subscriptions.models import Product


class ProductBrochureSettings(models.Model):
    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name="brochure_settings",
    )
    visible_on_public_catalog = models.BooleanField(default=True)
    visible_on_rent_catalog = models.BooleanField(default=True)
    visible_on_lease_catalog = models.BooleanField(default=True)
    visible_on_lucky_emi_catalog = models.BooleanField(default=True)
    visible_on_sale_catalog = models.BooleanField(default=True)
    monthly_rent = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    lease_monthly_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    security_deposit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    brochure_sort_order = models.PositiveIntegerField(default=100)
    brochure_featured = models.BooleanField(default=False)
    short_description = models.CharField(max_length=180, blank=True)
    public_badge = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            "-brochure_featured",
            "brochure_sort_order",
            "product__name",
            "product_id",
        ]
        verbose_name = "Product brochure settings"
        verbose_name_plural = "Product brochure settings"

    def __str__(self):
        return f"Brochure settings: {self.product}"


class BrochureDocument(models.Model):
    class BrochureType(models.TextChoices):
        RENT = "RENT", "Rent"
        LEASE = "LEASE", "Lease"
        LUCKY_EMI = "LUCKY_EMI", "Lucky EMI"
        DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
        CUSTOM = "CUSTOM", "Custom"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        GENERATED = "GENERATED", "Generated"
        EXPIRED = "EXPIRED", "Expired"

    brochure_no = models.CharField(max_length=40, unique=True)
    brochure_type = models.CharField(max_length=20, choices=BrochureType.choices)
    title = models.CharField(max_length=160)
    public_token = models.CharField(max_length=80, unique=True, db_index=True)
    pdf_file = models.FileField(upload_to="brochures/")
    filter_payload = models.JSONField(default=dict, blank=True)
    product_snapshot = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.GENERATED,
        db_index=True,
    )
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_brochures",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["brochure_type", "status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.brochure_no} - {self.title}"


class BrochureEnquiry(models.Model):
    class PreferredPlan(models.TextChoices):
        RENT = "RENT", "Rent"
        LEASE = "LEASE", "Lease"
        LUCKY_EMI = "LUCKY_EMI", "Lucky EMI"
        DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
        NOT_SURE = "NOT_SURE", "Not Sure"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        QUOTED = "QUOTED", "Quoted"
        CONVERTED = "CONVERTED", "Converted"
        CLOSED = "CLOSED", "Closed"
        LOST = "LOST", "Lost"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        NORMAL = "NORMAL", "Normal"
        HIGH = "HIGH", "High"

    class CrmLinkStatus(models.TextChoices):
        NOT_ATTEMPTED = "NOT_ATTEMPTED", "Not Attempted"
        LINKED = "LINKED", "Linked"
        PARTIAL = "PARTIAL", "Partial"
        SKIPPED = "SKIPPED", "Skipped"
        FAILED = "FAILED", "Failed"

    enquiry_no = models.CharField(max_length=40, unique=True)
    brochure = models.ForeignKey(
        BrochureDocument,
        on_delete=models.PROTECT,
        related_name="enquiries",
    )
    brochure_token_snapshot = models.CharField(max_length=80, blank=True)
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=30, db_index=True)
    phone_normalized = models.CharField(max_length=32, blank=True, db_index=True)
    alternate_phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    location = models.CharField(max_length=180, blank=True)
    address_text = models.TextField(blank=True)
    preferred_plan = models.CharField(
        max_length=20,
        choices=PreferredPlan.choices,
        db_index=True,
    )
    message = models.TextField(blank=True)
    internal_note = models.TextField(blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    follow_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_contacted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.NORMAL,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_brochure_enquiries",
    )
    crm_party = models.ForeignKey(
        "crm.PartyMaster",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="brochure_enquiries",
    )
    crm_interaction = models.ForeignKey(
        "crm.PartyInteraction",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="brochure_enquiries",
    )
    crm_lead = models.ForeignKey(
        "crm.Lead",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="brochure_enquiries",
    )
    crm_sync_warning = models.TextField(blank=True)
    crm_link_status = models.CharField(
        max_length=20,
        choices=CrmLinkStatus.choices,
        default=CrmLinkStatus.NOT_ATTEMPTED,
        db_index=True,
    )
    crm_link_message = models.TextField(blank=True)
    crm_linked_at = models.DateTimeField(null=True, blank=True)
    duplicate_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="possible_duplicates",
    )
    duplicate_reason = models.CharField(max_length=240, blank=True)
    is_possible_duplicate = models.BooleanField(default=False, db_index=True)
    source = models.CharField(max_length=40, default="BROCHURE")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "priority", "created_at"]),
            models.Index(fields=["assigned_to", "status", "created_at"]),
            models.Index(fields=["phone_normalized", "brochure", "created_at"]),
        ]

    def __str__(self):
        return f"{self.enquiry_no} - {self.customer_name}"


class BrochureEnquiryProduct(models.Model):
    enquiry = models.ForeignKey(
        BrochureEnquiry,
        on_delete=models.CASCADE,
        related_name="products",
    )
    product = models.ForeignKey(
        Product,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="brochure_enquiry_products",
    )
    product_snapshot = models.JSONField(default=dict, blank=True)
    brochure_product_code = models.CharField(max_length=80, blank=True)
    brochure_product_name = models.CharField(max_length=180, blank=True)
    requested_quantity = models.PositiveIntegerField(default=1)
    preferred_plan = models.CharField(
        max_length=20,
        choices=BrochureEnquiry.PreferredPlan.choices,
        null=True,
        blank=True,
    )
    notes = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.enquiry.enquiry_no} - {self.brochure_product_name}"


class BrochureEnquiryStatusHistory(models.Model):
    class EventType(models.TextChoices):
        CREATED = "CREATED", "Created"
        STATUS = "STATUS", "Status"
        ASSIGNMENT = "ASSIGNMENT", "Assignment"
        PRIORITY = "PRIORITY", "Priority"
        FOLLOW_UP = "FOLLOW_UP", "Follow Up"

    enquiry = models.ForeignKey(
        BrochureEnquiry,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    event_type = models.CharField(
        max_length=20,
        choices=EventType.choices,
        default=EventType.STATUS,
    )
    from_status = models.CharField(max_length=30, blank=True)
    to_status = models.CharField(max_length=30)
    note = models.TextField(blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="brochure_enquiry_status_changes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.enquiry.enquiry_no}: {self.event_type}"
