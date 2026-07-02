from django.core.exceptions import ValidationError
from django.db import models

from subscriptions.models_business_setup import BusinessSetupTimeStampedModel
from subscriptions.services.secret_crypto import decrypt_secret, encrypt_secret


class EmailSMTPSettings(BusinessSetupTimeStampedModel):
    """
    Admin-configurable outbound email (SMTP) transport settings.

    This model controls only how outbound email (OTP delivery, notifications) is
    sent. It has no relationship to payment posting, invoice balance, EMI,
    waiver, reconciliation, stock, journal posting, settlement, commission,
    payout, or audit truth.

    The app password is stored encrypted at rest (Fernet, key derived from
    Django SECRET_KEY) and is never returned in plain text or ciphertext by
    the API.
    """

    smtp_host = models.CharField(max_length=255, blank=True, default="smtp.gmail.com")
    smtp_port = models.PositiveIntegerField(default=587)
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)
    smtp_username = models.EmailField(blank=True, default="")
    app_password_encrypted = models.TextField(blank=True, default="")
    from_email = models.EmailField(blank=True, default="")
    from_name = models.CharField(max_length=120, blank=True, default="")
    is_enabled = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_success = models.BooleanField(null=True, blank=True)
    last_test_message = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "email_smtp_settings"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["is_active"], name="email_smtp_is_active_idx")]

    def clean(self):
        errors = {}
        if self.is_active and EmailSMTPSettings.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active email SMTP settings record is allowed."
        if self.is_enabled and not self.smtp_username:
            errors["smtp_username"] = "SMTP username (Gmail address) is required to enable sending."
        if self.is_enabled and not self.app_password_encrypted:
            errors["app_password_encrypted"] = "App password is required to enable sending."
        if self.use_tls and self.use_ssl:
            errors["use_tls"] = "TLS and SSL cannot both be enabled."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        for field in ("smtp_host", "smtp_username", "from_email", "from_name", "last_test_message"):
            setattr(self, field, (getattr(self, field, "") or "").strip())
        self.full_clean()
        super().save(*args, **kwargs)

    def set_app_password(self, plain_password: str) -> None:
        self.app_password_encrypted = encrypt_secret((plain_password or "").strip())

    def get_app_password(self) -> str:
        return decrypt_secret(self.app_password_encrypted)

    @property
    def has_app_password(self) -> bool:
        return bool(self.app_password_encrypted)

    @property
    def effective_from_email(self) -> str:
        return self.from_email or self.smtp_username

    def __str__(self):
        return self.smtp_username or "Email SMTP Settings"
