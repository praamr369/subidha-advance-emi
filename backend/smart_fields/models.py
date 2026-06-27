from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.utils import timezone


class SmartFieldSource(models.TextChoices):
    """How a stored value entered the system."""

    SEED = "SEED", "Seeded dataset"
    LEARNED = "LEARNED", "Learned from suggestion"
    CONFIRMED = "CONFIRMED", "Confirmed by user"


class SmartTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PincodeLocation(SmartTimeStampedModel):
    """
    Offline India-Post style pincode -> location map.

    A single pincode can map to multiple (city, district) rows, so callers should
    treat results as a list of options. Rows are seeded from a bundled dataset and
    augmented over time via ``record_confirmation`` (source = CONFIRMED).
    """

    pincode = models.CharField(max_length=10, db_index=True)
    office_name = models.CharField(max_length=160, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    state_code = models.CharField(max_length=5, blank=True, default="")
    source = models.CharField(
        max_length=12,
        choices=SmartFieldSource.choices,
        default=SmartFieldSource.SEED,
        db_index=True,
    )
    hit_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "smart_pincode_locations"
        ordering = ["pincode", "-hit_count", "city", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["pincode", "city", "district", "state"],
                name="uq_pincode_city_district_state",
            ),
        ]
        indexes = [
            models.Index(fields=["pincode", "-hit_count"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return f"{self.pincode} -> {self.city}, {self.state}"

    def save(self, *args, **kwargs):
        self.pincode = (self.pincode or "").strip()
        self.office_name = (self.office_name or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.state_code = (self.state_code or "").strip().upper()
        super().save(*args, **kwargs)


class HsnCode(SmartTimeStampedModel):
    """Offline HSN/SAC master used to score suggestions for a product."""

    code = models.CharField(max_length=20, db_index=True)
    description = models.CharField(max_length=400, blank=True, default="")
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    chapter = models.CharField(max_length=10, blank=True, default="", db_index=True)
    # Space-joined lowercase tokens used for cheap local token-overlap scoring.
    keywords = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "smart_hsn_codes"
        ordering = ["code", "id"]
        constraints = [
            models.UniqueConstraint(fields=["code"], name="uq_smart_hsn_code"),
        ]

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return f"{self.code} ({self.gst_rate}%)"

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.description = (self.description or "").strip()
        self.chapter = (self.chapter or "").strip()
        self.keywords = (self.keywords or "").strip().lower()
        super().save(*args, **kwargs)


class FieldSuggestionMapping(SmartTimeStampedModel):
    """
    Generic self-learning cache that powers every smart field.

    ``field_key`` namespaces the mapping (e.g. ``"product.hsn"``). ``input_normalized``
    is the normalized text the user typed. When a suggestion is confirmed it is stored
    here so future lookups for the same input return the confirmed value first.
    """

    field_key = models.CharField(max_length=64, db_index=True)
    input_normalized = models.CharField(max_length=255, db_index=True)
    suggested_value = models.CharField(max_length=120)
    suggested_label = models.CharField(max_length=255, blank=True, default="")
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    source = models.CharField(
        max_length=12,
        choices=SmartFieldSource.choices,
        default=SmartFieldSource.CONFIRMED,
        db_index=True,
    )
    hit_count = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "smart_field_suggestion_mappings"
        ordering = ["field_key", "-hit_count", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["field_key", "input_normalized"],
                name="uq_field_key_input",
            ),
        ]
        indexes = [
            models.Index(fields=["field_key", "input_normalized"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return f"{self.field_key}: {self.input_normalized} -> {self.suggested_value}"
