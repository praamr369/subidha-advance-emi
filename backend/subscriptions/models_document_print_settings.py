from pathlib import Path
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import models

from subscriptions.models_business_setup import BusinessProfile, BusinessSetupTimeStampedModel


DOCUMENT_PRINT_LOGO_MAX_BYTES = 2 * 1024 * 1024
DOCUMENT_PRINT_LOGO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def document_print_logo_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if extension not in DOCUMENT_PRINT_LOGO_EXTENSIONS:
        extension = ".img"
    token = uuid4().hex[:12]
    return f"business/print-branding/logo-{token}{extension}"


class DocumentPrintLayoutDensity(models.TextChoices):
    COMFORTABLE = "COMFORTABLE", "Comfortable"
    COMPACT = "COMPACT", "Compact"


class DocumentPrintSettings(BusinessSetupTimeStampedModel):
    """
    Presentation-only settings for branded print/PDF documents.

    This model intentionally has no relationship to payment posting, invoice
    balance, EMI, waiver, reconciliation, stock, journal posting, settlement,
    commission, payout, or audit truth. It controls only display identity,
    wording, logo, terms, and print layout preferences.
    """

    business_profile = models.OneToOneField(
        BusinessProfile,
        on_delete=models.PROTECT,
        related_name="document_print_settings",
        null=True,
        blank=True,
    )
    business_logo = models.ImageField(upload_to=document_print_logo_upload_to, null=True, blank=True)
    business_name = models.CharField(max_length=255, blank=True, default="")
    business_tagline = models.CharField(max_length=255, blank=True, default="")
    print_address = models.TextField(blank=True, default="")
    print_phone = models.CharField(max_length=40, blank=True, default="")
    print_email = models.EmailField(blank=True, default="")
    print_website = models.CharField(max_length=255, blank=True, default="")
    tax_label = models.CharField(max_length=120, blank=True, default="")

    invoice_terms = models.TextField(blank=True, default="")
    receipt_terms = models.TextField(blank=True, default="")
    delivery_challan_terms = models.TextField(blank=True, default="")
    subscription_contract_terms = models.TextField(blank=True, default="")
    rent_lease_contract_terms = models.TextField(blank=True, default="")
    purchase_bill_terms = models.TextField(blank=True, default="")
    vendor_voucher_terms = models.TextField(blank=True, default="")
    account_statement_terms = models.TextField(blank=True, default="")
    report_footer_note = models.TextField(blank=True, default="")

    authorized_signatory_label = models.CharField(max_length=120, blank=True, default="")
    customer_signature_label = models.CharField(max_length=120, blank=True, default="")
    document_layout_density = models.CharField(
        max_length=16,
        choices=DocumentPrintLayoutDensity.choices,
        default=DocumentPrintLayoutDensity.COMFORTABLE,
    )
    show_watermark = models.BooleanField(default=True)
    show_logo = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "document_print_settings"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["is_active"])]

    def clean(self):
        errors = {}
        if self.is_active and DocumentPrintSettings.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active document print settings record is allowed."

        if self.business_logo:
            name = getattr(self.business_logo, "name", "") or ""
            extension = Path(name).suffix.lower()
            if extension and extension not in DOCUMENT_PRINT_LOGO_EXTENSIONS:
                errors["business_logo"] = "Logo must be JPG, JPEG, PNG, WEBP, or GIF."
            size = getattr(self.business_logo, "size", 0) or 0
            if size > DOCUMENT_PRINT_LOGO_MAX_BYTES:
                errors["business_logo"] = "Logo must be 2 MB or smaller."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        for field in (
            "business_name",
            "business_tagline",
            "print_address",
            "print_phone",
            "print_email",
            "print_website",
            "tax_label",
            "invoice_terms",
            "receipt_terms",
            "delivery_challan_terms",
            "subscription_contract_terms",
            "rent_lease_contract_terms",
            "purchase_bill_terms",
            "vendor_voucher_terms",
            "account_statement_terms",
            "report_footer_note",
            "authorized_signatory_label",
            "customer_signature_label",
        ):
            setattr(self, field, (getattr(self, field, "") or "").strip())
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.business_name or "Document Print Settings"
