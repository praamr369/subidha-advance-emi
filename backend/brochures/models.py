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
