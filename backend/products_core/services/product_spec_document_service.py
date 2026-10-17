"""Product Specification Document Service (Area A: Document Pattern with JSONB).

Enables rich querying, filtering, and normalization of product attributes and
specifications stored in the JSONB column `base_specs` on `products_core.Product`.
Provides document-oriented lookups without needing complex EAV schema joins.
"""
from __future__ import annotations

from typing import Any, Optional
from django.db.models import QuerySet


def get_spec_value(product, spec_key: str, default: Any = None) -> Any:
    """
    Safely extract a specification value from a product's base_specs JSON document.
    Handles nested keys using dot notation: 'dimensions.width'.
    """
    if not product or not getattr(product, "base_specs", None):
        return default

    specs = product.base_specs
    if not isinstance(specs, dict):
        return default

    parts = spec_key.split(".")
    curr = specs
    for part in parts:
        if isinstance(curr, dict) and part in curr:
            curr = curr[part]
        else:
            return default
    return curr


def filter_products_by_spec(queryset: QuerySet, **spec_kwargs) -> QuerySet:
    """
    Filter a Product queryset using JSONB containment or key lookups on base_specs.
    Example:
        filter_products_by_spec(qs, wood_type="Teak", finish="Gloss")
        filter_products_by_spec(qs, **{"dimensions__width__gte": 150})
    """
    filters = {}
    for key, val in spec_kwargs.items():
        if val is None:
            continue
        filters[f"base_specs__{key}"] = val

    if filters:
        return queryset.filter(**filters)
    return queryset


def set_spec_values(product, updates: dict, *, save: bool = False) -> dict:
    """
    Safely merge or update specification keys in a Product's base_specs document.
    """
    if not isinstance(product.base_specs, dict):
        product.base_specs = {}

    cleaned_updates = {}
    for k, v in updates.items():
        clean_key = str(k).strip()
        if clean_key:
            cleaned_updates[clean_key] = v

    product.base_specs.update(cleaned_updates)

    if save and getattr(product, "id", None):
        product.save(update_fields=["base_specs"])

    return product.base_specs


def search_products_by_spec_text(queryset: QuerySet, search_term: str) -> QuerySet:
    """
    Full text/document search inside product specs dictionary using JSON containment.
    """
    term = (search_term or "").strip()
    if not term:
        return queryset

    # In PostgreSQL, JSONField text search works across keys and values
    return queryset.filter(base_specs__icontains=term)

