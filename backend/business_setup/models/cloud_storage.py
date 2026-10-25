from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from business_setup.models.core import BusinessSetupTimeStampedModel
from subscriptions.services.secret_crypto import decrypt_secret, encrypt_secret


class CloudStorageProvider(models.TextChoices):
    CLOUDFLARE_R2 = "CLOUDFLARE_R2", "Cloudflare R2 (10 GB Free Forever)"
    GOOGLE_DRIVE = "GOOGLE_DRIVE", "Google Drive (15 GB Free via rclone)"
    LOCAL_ONLY = "LOCAL_ONLY", "Local Server Only"


class FreeCloudStorageSettings(BusinessSetupTimeStampedModel):
    """
    Admin-configurable free cloud storage settings for offsite backup sync
    and batch archive storage (Cloudflare R2 S3-compatible or Google Drive via rclone).

    Follows the same zero-cost, auditable security pattern as EmailSMTPSettings:
    the secret access key is stored encrypted at rest using Fernet and is never
    echoed back in plain text by GET responses.
    """

    provider = models.CharField(
        max_length=32,
        choices=CloudStorageProvider.choices,
        default=CloudStorageProvider.CLOUDFLARE_R2,
    )
    endpoint_url = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="e.g. https://<account_id>.r2.cloudflarestorage.com",
    )
    bucket_name = models.CharField(max_length=120, blank=True, default="")
    access_key_id = models.CharField(max_length=120, blank=True, default="")
    secret_access_key_encrypted = models.TextField(blank=True, default="")
    rclone_remote_name = models.CharField(
        max_length=120,
        blank=True,
        default="gdrive:subidha_backups",
        help_text="rclone remote name for Google Drive sync",
    )
    is_enabled = models.BooleanField(default=False)
    auto_sync_nightly = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_success = models.BooleanField(null=True, blank=True)
    last_test_message = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "free_cloud_storage_settings"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["is_active"], name="cloud_storage_is_active_idx")]

    @property
    def has_secret_access_key(self) -> bool:
        return bool(self.secret_access_key_encrypted)

    def set_secret_access_key(self, plain: str) -> None:
        trimmed = (plain or "").strip()
        self.secret_access_key_encrypted = encrypt_secret(trimmed) if trimmed else ""

    def get_secret_access_key(self) -> str:
        if not self.secret_access_key_encrypted:
            return ""
        try:
            return decrypt_secret(self.secret_access_key_encrypted)
        except Exception:
            return ""

    def clean(self):
        errors = {}
        if self.is_active and FreeCloudStorageSettings.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active free cloud storage settings record is allowed."
        if self.is_enabled:
            if self.provider == CloudStorageProvider.CLOUDFLARE_R2:
                if not self.endpoint_url:
                    errors["endpoint_url"] = "Endpoint URL is required for Cloudflare R2."
                if not self.bucket_name:
                    errors["bucket_name"] = "Bucket name is required for Cloudflare R2."
                if not self.access_key_id:
                    errors["access_key_id"] = "Access Key ID is required for Cloudflare R2."
                if not self.secret_access_key_encrypted:
                    errors["secret_access_key"] = "Secret Access Key is required for Cloudflare R2."
            elif self.provider == CloudStorageProvider.GOOGLE_DRIVE:
                if not self.rclone_remote_name:
                    errors["rclone_remote_name"] = "rclone remote name is required for Google Drive sync."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        for field in ("endpoint_url", "bucket_name", "access_key_id", "rclone_remote_name", "last_test_message"):
            setattr(self, field, (getattr(self, field, "") or "").strip())
        self.full_clean()
        super().save(*args, **kwargs)
