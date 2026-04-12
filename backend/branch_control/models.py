from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class BranchControlTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BranchStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class Branch(BranchControlTimeStampedModel):
    code = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    status = models.CharField(
        max_length=12,
        choices=BranchStatus.choices,
        default=BranchStatus.ACTIVE,
        db_index=True,
    )
    is_primary = models.BooleanField(default=False, db_index=True)
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "branch_control_branches"
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_primary"],
                condition=Q(is_primary=True),
                name="branch_control_unique_primary_branch",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "is_primary"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.email = (self.email or "").strip()
        self.address = (self.address or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class CashCounter(BranchControlTimeStampedModel):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="cash_counters",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="cash_counters",
    )
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assigned_cash_counters",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "branch_control_cash_counters"
        ordering = ["branch__name", "name", "id"]
        indexes = [
            models.Index(fields=["branch", "is_active"]),
            models.Index(fields=["assigned_user", "is_active"]),
        ]

    def clean(self):
        errors = {}
        if self.finance_account_id and not self.finance_account.is_active:
            errors["finance_account"] = "Counter finance account must be active."
        finance_branch_id = getattr(self.finance_account, "branch_id", None)
        if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
            errors["finance_account"] = "Counter finance account must belong to the same branch."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

