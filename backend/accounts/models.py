from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    PARTNER = "PARTNER", "Partner"
    CUSTOMER = "CUSTOMER", "Customer"
    CASHIER = "CASHIER", "Cashier"
    VENDOR = "VENDOR", "Vendor"
    STAFF = "STAFF", "Staff"


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


class StaffIdentity(models.Model):
    """One-to-one login identity for an internal employee profile.

    The employee profile remains the HR/payroll source of truth. This link only
    enables staff portal authentication and self-scoped reads.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="staff_identity",
    )
    employee = models.OneToOneField(
        "accounting.EmployeeProfile",
        on_delete=models.PROTECT,
        related_name="staff_identity",
    )
    login_enabled = models.BooleanField(default=True, db_index=True)
    temporary_password_last_set_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_staff_identities",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_identities"
        ordering = ["employee_id"]
        indexes = [
            models.Index(fields=["login_enabled"]),
        ]

    def clean(self):
        errors = {}
        if self.user_id and getattr(self.user, "role", None) != UserRole.STAFF:
            errors["user"] = "Staff identity must link to a STAFF user."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee_id} -> {self.user_id}"


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

    def __str__(self):
        return f"{self.user_id}:{self.capability.code}={self.is_allowed}"
