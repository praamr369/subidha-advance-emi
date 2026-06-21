from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.db.models import Q

from brochures.models import BrochureDocument
from subscriptions.models import Product

ZERO = Decimal("0.00")


def _money(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount > ZERO else None


def _settings(product: Product):
    try:
        return product.brochure_settings
    except Product.brochure_settings.RelatedObjectDoesNotExist:
        return None


def _flag(settings_row, field_name: str, default: bool = True) -> bool:
    if settings_row is None:
        return default
    return bool(getattr(settings_row, field_name, default))


def _text(value: Any) -> str:
    return str(value or "").strip()


def _category(product: Product) -> str:
    master = getattr(product, "category_master", None)
    return (
        _text(getattr(master, "name", None))
        or _text(getattr(product, "category", None))
        or "Uncategorized"
    )


def _inventory_availability(product: Product) -> tuple[bool, str]:
    """
    Use inventory only when a profile exists. Products without a prepared
    inventory profile remain brochure-safe with an "on request" label; absence
    of optional inventory data must not be interpreted as damaged stock.
    """
    try:
        profile = product.inventory_profile
    except Product.inventory_profile.RelatedObjectDoesNotExist:
        return True, "Availability on request"

    if not bool(getattr(profile, "is_active", True)):
        return False, "Unavailable"
    if _text(getattr(profile, "stock_tracking_status", "")).upper() == "ARCHIVED":
        return False, "Unavailable"
    if not bool(getattr(profile, "stock_tracking_enabled", False)):
        return True, "Available"

    try:
        available = profile.available_qty()
    except (AttributeError, TypeError, ValueError):
        return True, "Availability on request"
    if available <= 0:
        return False, "Currently unavailable"
    return True, "In stock"


def _type_visibility_and_price(
    product: Product, brochure_type: str
) -> tuple[bool, dict[str, str | None]]:
    settings_row = _settings(product)
    base_price = _money(getattr(product, "base_price", None))
    monthly_rent = _money(getattr(settings_row, "monthly_rent", None))
    lease_monthly = _money(getattr(settings_row, "lease_monthly_amount", None))
    security_deposit = _money(getattr(settings_row, "security_deposit", None))

    prices: dict[str, str | None] = {
        "sale_price": None,
        "monthly_rent": None,
        "lease_monthly_amount": None,
        "security_deposit": None,
    }

    if brochure_type == BrochureDocument.BrochureType.RENT:
        visible = (
            _flag(settings_row, "visible_on_rent_catalog")
            and bool(getattr(product, "is_rent_enabled", False))
            and monthly_rent is not None
        )
        prices["monthly_rent"] = str(monthly_rent) if visible else None
        prices["security_deposit"] = (
            str(security_deposit) if visible and security_deposit else None
        )
        return visible, prices

    if brochure_type == BrochureDocument.BrochureType.LEASE:
        visible = (
            _flag(settings_row, "visible_on_lease_catalog")
            and bool(getattr(product, "is_lease_enabled", False))
            and lease_monthly is not None
        )
        prices["lease_monthly_amount"] = str(lease_monthly) if visible else None
        prices["security_deposit"] = (
            str(security_deposit) if visible and security_deposit else None
        )
        return visible, prices

    if brochure_type == BrochureDocument.BrochureType.LUCKY_EMI:
        visible = (
            _flag(settings_row, "visible_on_lucky_emi_catalog")
            and bool(getattr(product, "is_emi_enabled", True))
            and base_price is not None
        )
        prices["sale_price"] = str(base_price) if visible else None
        return visible, prices

    if brochure_type == BrochureDocument.BrochureType.DIRECT_SALE:
        visible = (
            _flag(settings_row, "visible_on_sale_catalog")
            and bool(getattr(product, "is_direct_sale_enabled", True))
            and base_price is not None
        )
        prices["sale_price"] = str(base_price) if visible else None
        return visible, prices

    # A custom brochure can show any independently brochure-safe offering.
    sale_visible = base_price is not None and (
        (
            _flag(settings_row, "visible_on_sale_catalog")
            and bool(getattr(product, "is_direct_sale_enabled", True))
        )
        or (
            _flag(settings_row, "visible_on_lucky_emi_catalog")
            and bool(getattr(product, "is_emi_enabled", True))
        )
    )
    rent_visible = (
        monthly_rent is not None
        and _flag(settings_row, "visible_on_rent_catalog")
        and bool(getattr(product, "is_rent_enabled", False))
    )
    lease_visible = (
        lease_monthly is not None
        and _flag(settings_row, "visible_on_lease_catalog")
        and bool(getattr(product, "is_lease_enabled", False))
    )
    prices["sale_price"] = str(base_price) if sale_visible else None
    prices["monthly_rent"] = str(monthly_rent) if rent_visible else None
    prices["lease_monthly_amount"] = str(lease_monthly) if lease_visible else None
    prices["security_deposit"] = (
        str(security_deposit)
        if security_deposit and (rent_visible or lease_visible)
        else None
    )
    return bool(sale_visible or rent_visible or lease_visible), prices


def _snapshot(
    product: Product, brochure_type: str, availability_label: str
) -> dict[str, Any]:
    settings_row = _settings(product)
    _, prices = _type_visibility_and_price(product, brochure_type)
    short_description = _text(getattr(settings_row, "short_description", None))
    if not short_description:
        short_description = _text(getattr(product, "description", None))[:180]
    return {
        "id": product.id,
        "product_code": _text(getattr(product, "product_code", None)),
        "name": _text(getattr(product, "name", None)),
        "category": _category(product),
        "short_description": short_description,
        "public_badge": _text(getattr(settings_row, "public_badge", None)),
        "sale_price": prices["sale_price"],
        "monthly_rent": prices["monthly_rent"],
        "lease_monthly_amount": prices["lease_monthly_amount"],
        "security_deposit": prices["security_deposit"],
        "availability_label": availability_label,
        "public_product_url": f"/products/{product.id}",
        "featured": bool(getattr(settings_row, "brochure_featured", False)),
        "sort_order": int(getattr(settings_row, "brochure_sort_order", 100) or 100),
    }


def get_brochure_products(
    *,
    brochure_type: str,
    category: str | None = None,
    product_ids: list[int] | None = None,
) -> list[dict[str, Any]]:
    normalized_type = _text(brochure_type).upper()
    if normalized_type not in BrochureDocument.BrochureType.values:
        raise ValueError("Unsupported brochure type.")

    queryset = Product.objects.select_related(
        "category_master",
        "brochure_settings",
        "inventory_profile",
    ).filter(is_active=True)

    # Product currently has lifecycle_status, but this defensive check keeps the
    # service compatible with older additive schemas.
    if any(field.name == "lifecycle_status" for field in Product._meta.fields):
        queryset = queryset.exclude(
            lifecycle_status__in=["DISCONTINUED", "MAINTENANCE"]
        )

    # Publication is explicit opt-in. A product must have brochure settings;
    # model defaults make configuration quick without making unreviewed products
    # public merely because they already exist in the product master.
    queryset = queryset.filter(
        brochure_settings__isnull=False,
        brochure_settings__visible_on_public_catalog=True,
    )

    if product_ids:
        queryset = queryset.filter(id__in=product_ids)
    if category:
        category_text = _text(category)
        category_filter = Q(category__iexact=category_text) | Q(
            category_master__name__iexact=category_text
        )
        if category_text.isdigit():
            category_filter |= Q(category_master_id=int(category_text))
        queryset = queryset.filter(category_filter)

    rows: list[dict[str, Any]] = []
    for product in queryset:
        if not _text(getattr(product, "name", None)):
            continue
        type_visible, _ = _type_visibility_and_price(product, normalized_type)
        if not type_visible:
            continue
        available, availability_label = _inventory_availability(product)
        if not available:
            continue
        rows.append(_snapshot(product, normalized_type, availability_label))

    rows.sort(
        key=lambda row: (
            not bool(row["featured"]),
            int(row["sort_order"]),
            str(row["name"]).casefold(),
            str(row["product_code"]).casefold(),
        )
    )
    return rows
