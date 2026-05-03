from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    PARTNER = "PARTNER", "Partner"
    CUSTOMER = "CUSTOMER", "Customer"
    CASHIER = "CASHIER", "Cashier"


class User(AbstractUser):
    phone = models.CharField(max_length=15, unique=True, db_index=True, blank=True, null=True)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.CUSTOMER,
        db_index=True,
    )

    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Commission percentage for partner users.",
    )

    class Meta:
        db_table = "users"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["phone"]),
            models.Index(fields=["username"]),
        ]

    def clean(self):
        super().clean()
        errors = {}

        self.username = (self.username or "").strip()
        self.email = (self.email or "").strip()
        self.phone = (self.phone or "").strip()

        if not self.username:
            errors["username"] = "Username is required."

        if not self.phone:
            errors["phone"] = "Phone is required."

        if self.commission_rate is None:
            errors["commission_rate"] = "Commission rate is required."
        elif self.commission_rate < Decimal("0.00"):
            errors["commission_rate"] = "Commission rate cannot be negative."
        elif self.commission_rate > Decimal("100.00"):
            errors["commission_rate"] = "Commission rate cannot exceed 100.00."

        if self.role != UserRole.PARTNER and self.commission_rate != Decimal("0.00"):
            errors["commission_rate"] = "Only partner users can have a non-zero commission rate."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.username = (self.username or "").strip()
        self.email = (self.email or "").strip()
        self.phone = (self.phone or "").strip()

        if self.role != UserRole.PARTNER:
            self.commission_rate = Decimal("0.00")

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"


class PasswordResetChannel(models.TextChoices):
    PHONE_OTP = "PHONE_OTP", "Phone OTP"
    EMAIL_OTP = "EMAIL_OTP", "Email OTP"
    EMAIL_LINK = "EMAIL_LINK", "Email Link"


class PasswordResetStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VERIFIED = "VERIFIED", "Verified"
    USED = "USED", "Used"
    EXPIRED = "EXPIRED", "Expired"
    CANCELLED = "CANCELLED", "Cancelled"
    LOCKED = "LOCKED", "Locked"


DEFAULT_CAPABILITY_CODES = (
    "billing.view",
    "billing.collect",
    "billing.override_allocation",
    "accounting.view",
    "accounting.reverse_entry",
    "batch.lock",
    "draw.commit",
    "draw.complete",
    "inventory.adjust",
    "inventory.opening_stock",
    "vendor.manage",
    "crm.manage",
    "reports.export",
    "business_setup.reset",
)


class Capability(models.Model):
    code = models.CharField(max_length=120, unique=True, db_index=True)
    label = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "capabilities"
        ordering = ["code", "id"]

    def clean(self):
        super().clean()
        self.code = (self.code or "").strip().lower()
        self.label = (self.label or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Capability code is required."
        if not self.label:
            errors["label"] = "Capability label is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().lower()
        self.label = (self.label or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class RoleCapability(models.Model):
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        db_index=True,
    )
    capability = models.ForeignKey(
        Capability,
        on_delete=models.CASCADE,
        related_name="role_assignments",
    )
    is_allowed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "role_capabilities"
        ordering = ["role", "capability__code", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["role", "capability"],
                name="unique_role_capability_assignment",
            )
        ]
        indexes = [
            models.Index(fields=["role", "is_allowed"]),
            models.Index(fields=["capability", "is_allowed"]),
        ]

    def __str__(self):
        return f"{self.role}:{self.capability.code}={self.is_allowed}"


class UserCapabilityOverride(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="capability_overrides",
    )
    capability = models.ForeignKey(
        Capability,
        on_delete=models.CASCADE,
        related_name="user_overrides",
    )
    is_allowed = models.BooleanField(default=False)
    note = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="created_capability_overrides",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="updated_capability_overrides",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_capability_overrides"
        ordering = ["user_id", "capability__code", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "capability"],
                name="unique_user_capability_override",
            )
        ]
        indexes = [
            models.Index(fields=["user", "is_allowed"]),
            models.Index(fields=["capability", "is_allowed"]),
        ]

    def clean(self):
        super().clean()
        self.note = (self.note or "").strip()

    def save(self, *args, **kwargs):
        self.note = (self.note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"user={self.user_id}:{self.capability.code}={self.is_allowed}"


class PasswordResetRequest(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="password_reset_requests",
    )
    role_snapshot = models.CharField(max_length=20, db_index=True)
    channel = models.CharField(
        max_length=20,
        choices=PasswordResetChannel.choices,
        default=PasswordResetChannel.PHONE_OTP,
        db_index=True,
    )
    identifier_snapshot = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Identifier used at request time, such as phone, email, or username.",
    )
    otp_hash = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Store only the hashed OTP. Never store raw OTP values.",
    )
    expires_at = models.DateTimeField(db_index=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=PasswordResetStatus.choices,
        default=PasswordResetStatus.PENDING,
        db_index=True,
    )
    failed_attempt_count = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    resend_count = models.PositiveIntegerField(default=0)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    requested_by_ip = models.GenericIPAddressField(null=True, blank=True)
    requested_user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "password_reset_requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status", "created_at"]),
            models.Index(fields=["identifier_snapshot", "status", "created_at"]),
            models.Index(fields=["channel", "status", "expires_at"]),
        ]

    def clean(self):
        super().clean()
        errors = {}

        self.role_snapshot = (self.role_snapshot or "").strip()
        self.identifier_snapshot = (self.identifier_snapshot or "").strip()
        self.requested_user_agent = (self.requested_user_agent or "").strip()

        if not self.role_snapshot:
            errors["role_snapshot"] = "Role snapshot is required."

        if self.role_snapshot not in UserRole.values:
            errors["role_snapshot"] = "Role snapshot is invalid."

        if not self.identifier_snapshot:
            errors["identifier_snapshot"] = "Identifier snapshot is required."

        if self.max_attempts <= 0:
            errors["max_attempts"] = "Max attempts must be greater than zero."

        if self.failed_attempt_count < 0:
            errors["failed_attempt_count"] = "Failed attempt count cannot be negative."

        if self.failed_attempt_count > self.max_attempts:
            errors["failed_attempt_count"] = "Failed attempt count cannot exceed max attempts."

        if self.resend_count < 0:
            errors["resend_count"] = "Resend count cannot be negative."

        if self.expires_at is None:
            errors["expires_at"] = "Expiry time is required."

        if self.verified_at and self.verified_at > timezone.now():
            errors["verified_at"] = "Verified time cannot be in the future."

        if self.used_at and self.used_at > timezone.now():
            errors["used_at"] = "Used time cannot be in the future."

        if self.last_sent_at and self.last_sent_at > timezone.now():
            errors["last_sent_at"] = "Last sent time cannot be in the future."

        if self.verified_at and self.used_at and self.used_at < self.verified_at:
            errors["used_at"] = "Used time cannot be earlier than verified time."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.role_snapshot = (self.role_snapshot or "").strip()
        self.identifier_snapshot = (self.identifier_snapshot or "").strip()
        self.requested_user_agent = (self.requested_user_agent or "").strip()

        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_locked(self) -> bool:
        return self.failed_attempt_count >= self.max_attempts or self.status == PasswordResetStatus.LOCKED

    @property
    def is_pending(self) -> bool:
        return self.status == PasswordResetStatus.PENDING

    def is_usable(self) -> bool:
        return (
            self.status == PasswordResetStatus.PENDING
            and not self.is_expired
            and self.failed_attempt_count < self.max_attempts
            and self.used_at is None
        )

    @classmethod
    def default_expiry(cls):
        return timezone.now() + timedelta(minutes=10)

    def mark_expired(self, save: bool = True):
        if self.status != PasswordResetStatus.EXPIRED:
            self.status = PasswordResetStatus.EXPIRED
            if save:
                self.save(update_fields=["status", "updated_at"])

    def mark_cancelled(self, save: bool = True):
        if self.status != PasswordResetStatus.CANCELLED:
            self.status = PasswordResetStatus.CANCELLED
            if save:
                self.save(update_fields=["status", "updated_at"])

    def mark_locked(self, save: bool = True):
        if self.status != PasswordResetStatus.LOCKED:
            self.status = PasswordResetStatus.LOCKED
            if save:
                self.save(update_fields=["status", "updated_at"])

    def mark_verified(self, save: bool = True):
        self.verified_at = timezone.now()
        self.status = PasswordResetStatus.VERIFIED
        if save:
            self.save(update_fields=["verified_at", "status", "updated_at"])

    def mark_used(self, save: bool = True):
        now = timezone.now()
        if not self.verified_at:
            self.verified_at = now
        self.used_at = now
        self.status = PasswordResetStatus.USED
        if save:
            self.save(update_fields=["verified_at", "used_at", "status", "updated_at"])

    def increment_failed_attempt(self, save: bool = True):
        self.failed_attempt_count += 1
        if self.failed_attempt_count >= self.max_attempts:
            self.status = PasswordResetStatus.LOCKED

        if save:
            update_fields = ["failed_attempt_count", "updated_at"]
            if self.status == PasswordResetStatus.LOCKED:
                update_fields.append("status")
            self.save(update_fields=update_fields)

    def __str__(self):
        return f"PasswordResetRequest#{self.pk} user={self.user_id} status={self.status}"