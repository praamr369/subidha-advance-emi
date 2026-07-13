from __future__ import annotations

import re

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


class CatalogTimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CatalogCategory(CatalogTimeStampedModel):
    """Admin-managed category tree for the new PIM catalog only."""

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )
    path = models.CharField(max_length=1024, unique=True, editable=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "catalog_categories"
        ordering = ["path", "sort_order", "name", "id"]
        indexes = [
            models.Index(fields=["parent", "is_active", "sort_order"]),
        ]

    def clean(self):
        errors = {}
        if not (self.name or "").strip():
            errors["name"] = "Category name is required."
        if self.parent_id and self.parent_id == self.pk:
            errors["parent"] = "A category cannot be its own parent."
        if self.pk and self.parent_id:
            ancestor_ids = set()
            node = self.parent
            while node is not None:
                if node.pk in ancestor_ids or node.pk == self.pk:
                    errors["parent"] = "A category cannot be moved below one of its descendants."
                    break
                ancestor_ids.add(node.pk)
                node = node.parent
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.slug = slugify(self.slug or self.name)[:140]
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.path or self.name


class AttributeInputType(models.TextChoices):
    SELECT = "SELECT", "Select"
    MULTI_SELECT = "MULTI_SELECT", "Multi-select"
    NUMBER = "NUMBER", "Number"
    TEXT = "TEXT", "Text"
    BOOLEAN = "BOOLEAN", "Boolean"


class AttributeDefinition(CatalogTimeStampedModel):
    """Dynamic catalog attribute contract owned by a PIM category."""

    category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.PROTECT,
        related_name="attribute_definitions",
    )
    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=80)
    input_type = models.CharField(max_length=20, choices=AttributeInputType.choices)
    options = models.JSONField(default=list, blank=True)
    unit = models.CharField(max_length=30, blank=True, default="")
    is_variant_attribute = models.BooleanField(default=False, db_index=True)
    is_spec_attribute = models.BooleanField(default=True, db_index=True)
    is_required = models.BooleanField(default=False, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    min_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    max_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    sku_code_map = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "catalog_attribute_definitions"
        ordering = ["category_id", "sort_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["category", "code"], name="uq_catalog_attribute_code_per_category"),
        ]
        indexes = [
            models.Index(fields=["category", "is_active", "sort_order"]),
        ]

    def clean(self):
        errors = {}
        self.name = (self.name or "").strip()
        self.code = re.sub(r"[^a-z0-9_]+", "_", (self.code or "").strip().lower()).strip("_")
        self.unit = (self.unit or "").strip()
        if not self.name:
            errors["name"] = "Attribute name is required."
        if not self.code:
            errors["code"] = "Attribute code is required."
        if not isinstance(self.options, list):
            errors["options"] = "Options must be a JSON array."
        elif self.input_type in {AttributeInputType.SELECT, AttributeInputType.MULTI_SELECT} and not self.options:
            errors["options"] = "Select attributes require at least one option."
        elif any(not isinstance(value, str) or not value.strip() for value in self.options):
            errors["options"] = "Every option must be a non-empty string."
        elif len({value.strip() for value in self.options}) != len(self.options):
            errors["options"] = "Options must not contain duplicates."
        if not isinstance(self.sku_code_map, dict):
            errors["sku_code_map"] = "SKU code map must be a JSON object."
        elif any(not isinstance(key, str) or not isinstance(value, str) or not value.strip() for key, value in self.sku_code_map.items()):
            errors["sku_code_map"] = "SKU code map must map strings to non-empty codes."
        elif self.sku_code_map and any(key not in self.options for key in self.sku_code_map):
            errors["sku_code_map"] = "SKU code map keys must be defined attribute options."
        if self.min_value is not None and self.max_value is not None and self.min_value > self.max_value:
            errors["max_value"] = "Maximum value must be greater than or equal to minimum value."
        if not self.is_variant_attribute and not self.is_spec_attribute:
            errors["is_spec_attribute"] = "An attribute must be a variant attribute, a spec attribute, or both."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.path}: {self.name}"
