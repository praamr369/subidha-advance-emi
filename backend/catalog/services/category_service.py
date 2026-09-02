from __future__ import annotations

from django.db import transaction

from catalog.models import CatalogCategory


def _path_for(category: CatalogCategory) -> str:
    return f"{category.parent.path}/{category.slug}" if category.parent_id else category.slug


@transaction.atomic
def save_category(*, category: CatalogCategory, validated_data: dict) -> CatalogCategory:
    """Create/update a category and atomically rebuild paths below a moved node."""
    if category.pk:
        category = CatalogCategory.objects.select_for_update().get(pk=category.pk)
    for field, value in validated_data.items():
        setattr(category, field, value)
    if category.parent_id:
        category.parent = CatalogCategory.objects.select_for_update().get(pk=category.parent_id)
    if not (category.slug or "").strip():
        from django.utils.text import slugify
        category.slug = slugify(category.name or "")[:140]
    category.path = _path_for(category)
    category.save()
    _rebuild_descendant_paths(category)
    return category


def _rebuild_descendant_paths(parent: CatalogCategory) -> None:
    for child in CatalogCategory.objects.select_for_update().filter(parent=parent).order_by("id"):
        child.path = _path_for(child)
        child.save()
        _rebuild_descendant_paths(child)
