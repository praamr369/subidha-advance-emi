from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from business_setup.models.core import BusinessSetupTimeStampedModel
from subscriptions.services.secret_crypto import decrypt_secret, encrypt_secret


class PaymentGatewayEnvironment(models.TextChoices):
    UAT = "UAT", "UAT (Sandbox / Testing)"
    PROD = "PROD", "Production (Live Real Money)"


class PaymentGatewaySettings(BusinessSetupTimeStampedModel):
    """
    Admin-configurable online payment gateway and UPI Autopay settings (PhonePe PG).

    Stores PhonePe Merchant ID, encrypted Salt Key, Salt Index, environment mode,
    and webhook configuration.

    The Salt Key is stored encrypted at rest (AES/Fernet via secret_crypto) and is
    never echoed back in plain text or ciphertext by the API.

    This model adheres strictly to append-only financial invariants: it configures
    gateway transport credentials only, while all financial posting delegates to
    the canonical route_collection() and accounting bridge engines.
    """

    merchant_id = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="PhonePe Merchant ID (MID), e.g. M3T05GQKO or PGTESTPAYUAT",
    )
    salt_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Encrypted PhonePe Salt Key / API Secret",
    )
    salt_index = models.PositiveSmallIntegerField(
        default=1,
        help_text="PhonePe Salt Index (usually 1)",
    )
    environment = models.CharField(
        max_length=20,
        choices=PaymentGatewayEnvironment.choices,
        default=PaymentGatewayEnvironment.UAT,
        db_index=True,
        help_text="Target PhonePe environment: UAT for test sandbox, PROD for live transactions",
    )
    is_enabled = models.BooleanField(
        default=False,
        help_text="Master toggle to enable/disable online PhonePe payments",
    )
    autopay_enabled = models.BooleanField(
        default=False,
        help_text="Toggle to allow recurring UPI Autopay / e-NACH mandates for EMI and Rent",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this configuration record is the currently active one",
    )
    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_success = models.BooleanField(null=True, blank=True)
    last_test_message = models.TextField(blank=True, default="")

    class Meta:
        db_table = "payment_gateway_settings"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["is_active"], name="pg_settings_is_active_idx"),
        ]

    def clean(self):
        errors = {}
        if self.is_active:
            existing = PaymentGatewaySettings.objects.filter(is_active=True).exclude(pk=self.pk)
            if existing.exists():
                errors["is_active"] = "Only one active payment gateway settings record is allowed."
        if self.is_enabled and not self.merchant_id:
            errors["merchant_id"] = "Merchant ID is required to enable PhonePe gateway."
        if self.is_enabled and not self.salt_key_encrypted:
            errors["salt_key_encrypted"] = "Salt Key is required to enable PhonePe gateway."
        if errors:
            raise ValidationError(errors)

    def set_salt_key(self, plain_key: str) -> None:
        key = (plain_key or "").strip()
        if key:
            self.salt_key_encrypted = encrypt_secret(key)
        else:
            self.salt_key_encrypted = ""

    def get_salt_key(self) -> str:
        if not self.salt_key_encrypted:
            return ""
        try:
            return decrypt_secret(self.salt_key_encrypted)
        except Exception:
            return ""

    @property
    def has_salt_key(self) -> bool:
        return bool(self.salt_key_encrypted)

    def save(self, *args, **kwargs):
        self.merchant_id = (self.merchant_id or "").strip()
        self.last_test_message = (self.last_test_message or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)
