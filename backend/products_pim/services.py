"""Bridge services keeping the operational product master (subscriptions.Product)
and its PIM editing layer (products_pim.PimProduct) linked and in sync.

The PimProduct is the rich-editing layer of a single operational product. Linking
them by `source_product` means attributes/variants edited on either surface live on
the same record, so a change in the product module reflects in PIM and vice versa.
"""
from __future__ import annotations


def ensure_pim_product_for_product(product) -> "object | None":
    """Return the PimProduct for an operational product, creating and linking one
    if it does not exist yet. Idempotent and safe to call on every save.
    """
    from products_pim.models import PimProduct, ProductCategory

    if not getattr(product, "product_code", ""):
        return None

    # Already linked?
    existing = PimProduct.objects.filter(source_product=product).first()
    if existing is not None:
        return existing

    # Link an existing PIM record that matches by code but predates the FK.
    by_code = PimProduct.objects.filter(code=product.product_code).first()
    if by_code is not None:
        if by_code.source_product_id != product.id:
            by_code.source_product = product
            by_code.save(update_fields=["source_product"])
        return by_code

    # Otherwise create a fresh linked PIM record under the Unclassified catch-all.
    unclassified, _ = ProductCategory.objects.get_or_create(
        slug="unclassified",
        defaults={"name": "Unclassified", "icon": "📦", "display_order": 999},
    )
    cat_map = {c.name.lower(): c for c in ProductCategory.objects.all()}
    category = cat_map.get((product.category or "").strip().lower(), unclassified)

    return PimProduct.objects.create(
        code=product.product_code,
        source_product=product,
        name=product.name,
        base_price=product.base_price,
        description=getattr(product, "description", "") or "",
        category=category,
        is_active=getattr(product, "is_active", True),
        is_published=False,
    )
