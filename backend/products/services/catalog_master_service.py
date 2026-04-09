from __future__ import annotations

from dataclasses import dataclass

from subscriptions.models import (
    Product,
    ProductCategoryMaster,
    ProductSubcategoryMaster,
    ProductUnitOfMeasureMaster,
)
from inventory.models import InventoryItemType


DEFAULT_UNIT_OF_MEASURE = "PCS"


def _clean_text(value: str | None) -> str:
    return (value or "").strip()


def _normalize_uom(value: str | None) -> str:
    normalized = _clean_text(value).upper()
    return normalized or DEFAULT_UNIT_OF_MEASURE


def _normalize_sku(value: str | None) -> str | None:
    normalized = _clean_text(value).upper()
    return normalized or None


def _resolve_category(name: str) -> ProductCategoryMaster | None:
    normalized = _clean_text(name)
    if not normalized:
        return None
    existing = ProductCategoryMaster.objects.filter(name__iexact=normalized).first()
    if existing:
        return existing
    return ProductCategoryMaster.objects.create(name=normalized, is_active=True)


def _resolve_subcategory(
    *,
    category: ProductCategoryMaster | None,
    name: str,
) -> ProductSubcategoryMaster | None:
    normalized = _clean_text(name)
    if not normalized or category is None:
        return None
    existing = ProductSubcategoryMaster.objects.filter(
        category=category,
        name__iexact=normalized,
    ).first()
    if existing:
        return existing
    return ProductSubcategoryMaster.objects.create(
        category=category,
        name=normalized,
        is_active=True,
    )


def _resolve_unit_of_measure(code: str) -> ProductUnitOfMeasureMaster | None:
    normalized = _normalize_uom(code)
    if not normalized:
        return None
    existing = ProductUnitOfMeasureMaster.objects.filter(code__iexact=normalized).first()
    if existing:
        return existing
    return ProductUnitOfMeasureMaster.objects.create(
        code=normalized,
        name=normalized,
        is_active=True,
    )


def sync_product_catalog_fields(product: Product) -> set[str]:
    changed_fields: set[str] = set()
    product.category = _clean_text(product.category)
    product.subcategory = _clean_text(product.subcategory)
    product.unit_of_measure = _normalize_uom(product.unit_of_measure)
    product.sku = _normalize_sku(product.sku)
    changed_fields.update({"category", "subcategory", "sku", "unit_of_measure"})

    category_master = getattr(product, "category_master", None)
    subcategory_master = getattr(product, "subcategory_master", None)
    unit_of_measure_master = getattr(product, "unit_of_measure_master", None)

    if category_master is not None and product.category:
        if product.category.lower() != category_master.name.lower():
            category_master = None
            product.category_master = None
            changed_fields.add("category_master")

    if subcategory_master is not None and product.subcategory:
        if product.subcategory.lower() != subcategory_master.name.lower():
            subcategory_master = None
            product.subcategory_master = None
            changed_fields.add("subcategory_master")

    if (
        subcategory_master is not None
        and category_master is not None
        and subcategory_master.category_id != category_master.id
    ):
        subcategory_master = None
        product.subcategory_master = None
        changed_fields.add("subcategory_master")

    if unit_of_measure_master is not None and product.unit_of_measure:
        if product.unit_of_measure.upper() != unit_of_measure_master.code.upper():
            unit_of_measure_master = None
            product.unit_of_measure_master = None
            changed_fields.add("unit_of_measure_master")

    if subcategory_master is not None:
        category_master = subcategory_master.category
        product.category_master = category_master
        product.subcategory = subcategory_master.name
        changed_fields.update({"category_master", "subcategory_master", "subcategory"})

    if category_master is not None:
        product.category = category_master.name
        changed_fields.add("category")
    elif product.category:
        category_master = _resolve_category(product.category)
        product.category_master = category_master
        product.category = category_master.name if category_master else product.category
        changed_fields.update({"category_master", "category"})
    else:
        product.category_master = None
        changed_fields.add("category_master")

    if product.subcategory:
        if subcategory_master is None:
            subcategory_master = _resolve_subcategory(
                category=category_master,
                name=product.subcategory,
            )
            product.subcategory_master = subcategory_master
            changed_fields.add("subcategory_master")
        if subcategory_master is not None:
            product.subcategory = subcategory_master.name
            changed_fields.add("subcategory")
    else:
        product.subcategory_master = None
        changed_fields.add("subcategory_master")

    if unit_of_measure_master is not None:
        product.unit_of_measure = unit_of_measure_master.code
        changed_fields.update({"unit_of_measure_master", "unit_of_measure"})
    else:
        resolved_unit = _resolve_unit_of_measure(product.unit_of_measure)
        product.unit_of_measure_master = resolved_unit
        if resolved_unit is not None:
            product.unit_of_measure = resolved_unit.code
        changed_fields.update({"unit_of_measure_master", "unit_of_measure"})

    return changed_fields


def sync_inventory_product_master_fields(product: Product) -> None:
    try:
        inventory_profile = product.inventory_profile
    except Exception:
        return

    update_fields: list[str] = []
    if product.sku and inventory_profile.sku != product.sku:
        inventory_profile.sku = product.sku
        update_fields.append("sku")
    if inventory_profile.unit_of_measure != product.unit_of_measure:
        inventory_profile.unit_of_measure = product.unit_of_measure
        update_fields.append("unit_of_measure")

    if update_fields:
        inventory_profile.save(update_fields=update_fields + ["updated_at"])


def ensure_inventory_profile_for_product(
    product: Product,
    *,
    default_stock_location=None,
    stock_tracking_enabled: bool = True,
):
    from inventory.models import InventoryItem

    defaults = {
        "sku": product.sku,
        "unit_of_measure": product.unit_of_measure or DEFAULT_UNIT_OF_MEASURE,
        "default_stock_location": default_stock_location,
        "stock_tracking_enabled": stock_tracking_enabled,
        "stock_item_type": InventoryItemType.FINISHED_GOOD,
        "delivery_stock_bridge_enabled": bool(product.is_emi_enabled),
        "is_active": product.is_active,
    }
    inventory_profile, created = InventoryItem.objects.get_or_create(
        product=product,
        defaults=defaults,
    )

    update_fields: list[str] = []
    if product.sku and inventory_profile.sku != product.sku:
        inventory_profile.sku = product.sku
        update_fields.append("sku")
    if inventory_profile.unit_of_measure != (product.unit_of_measure or DEFAULT_UNIT_OF_MEASURE):
        inventory_profile.unit_of_measure = product.unit_of_measure or DEFAULT_UNIT_OF_MEASURE
        update_fields.append("unit_of_measure")
    if default_stock_location is not None and inventory_profile.default_stock_location_id != getattr(default_stock_location, "id", None):
        inventory_profile.default_stock_location = default_stock_location
        update_fields.append("default_stock_location")
    if inventory_profile.is_active != product.is_active:
        inventory_profile.is_active = product.is_active
        update_fields.append("is_active")
    if created is False and inventory_profile.stock_tracking_enabled != stock_tracking_enabled:
        inventory_profile.stock_tracking_enabled = stock_tracking_enabled
        update_fields.append("stock_tracking_enabled")

    if update_fields:
        inventory_profile.save(update_fields=update_fields + ["updated_at"])

    return inventory_profile, created


@dataclass(frozen=True)
class ProductCatalogOptions:
    categories: list[dict[str, object]]
    subcategories: list[dict[str, object]]
    unit_of_measure_masters: list[dict[str, object]]
    unit_of_measure_options: list[str]


def build_product_catalog_options() -> ProductCatalogOptions:
    categories = [
        {"id": row.id, "name": row.name}
        for row in ProductCategoryMaster.objects.filter(is_active=True).order_by("name", "id")
    ]
    subcategories = [
        {
            "id": row.id,
            "name": row.name,
            "category_id": row.category_id,
            "category_name": row.category.name,
        }
        for row in ProductSubcategoryMaster.objects.select_related("category")
        .filter(is_active=True)
        .order_by("category__name", "name", "id")
    ]
    unit_masters = [
        {
            "id": row.id,
            "code": row.code,
            "name": row.name,
        }
        for row in ProductUnitOfMeasureMaster.objects.filter(is_active=True).order_by("code", "id")
    ]
    unit_options = sorted(
        {
            DEFAULT_UNIT_OF_MEASURE,
            *[row["code"] for row in unit_masters],
            *Product.objects.exclude(unit_of_measure="").values_list("unit_of_measure", flat=True),
        }
    )
    return ProductCatalogOptions(
        categories=categories,
        subcategories=subcategories,
        unit_of_measure_masters=unit_masters,
        unit_of_measure_options=unit_options,
    )
