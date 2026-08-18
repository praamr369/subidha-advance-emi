"""Bridge services keeping the operational product master (subscriptions.Product)
and its PIM editing layer (products_pim.PimProduct) linked and in sync.

The PimProduct is the rich-editing layer of a single operational product. Linking
them by `source_product` means attributes/variants edited on either surface live on
the same record, so a change in the product module reflects in PIM and vice versa.
"""
from __future__ import annotations

from itertools import product as itertools_product
from decimal import Decimal
from django.db import transaction


def ensure_pim_product_for_product(product) -> "object | None":
    """Return the PimProduct for an operational product, creating and linking one
    if it does not exist yet. Idempotent and safe to call on every save.
    """
    from products_pim.models import PimProduct, ProductCategory

    if not getattr(product, "product_code", ""):
        return None

    # Already linked? Update it to keep it in sync.
    existing = PimProduct.objects.filter(source_product=product).first()
    if existing is not None:
        needs_save = False
        if existing.code != product.product_code:
            existing.code = product.product_code
            needs_save = True
        if existing.name != product.name:
            existing.name = product.name
            needs_save = True
        if existing.base_price != product.base_price:
            existing.base_price = product.base_price
            needs_save = True
        
        if needs_save:
            existing.save(update_fields=["code", "name", "base_price"])
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


class VariantGenerationService:
    """Generate product variants from variant-defining attributes"""

    # Pricing multipliers: (attribute_slug, option_value) -> additional_price
    PRICING_MULTIPLIERS = {
        ("board_type", "Panel"): Decimal("2000"),
        ("thickness", "2 inch"): Decimal("1500"),
        ("size", "5/7 Queen"): Decimal("2500"),
        ("size", "6/7 Queen"): Decimal("2500"),
        ("size", "6/7 King"): Decimal("5000"),
        ("storage", "Foldable Storage"): Decimal("3500"),
        ("base_material", "Saal"): Decimal("1000"),
        ("ply_setup", "Waterproof 18mm/12mm"): Decimal("2000"),
        ("polish", "Gun Polish"): Decimal("1500"),
    }

    @staticmethod
    def generate_variants_for_product(pim_product, clear_existing=False):
        """
        Generate all variant combinations for a product.

        Args:
            pim_product: The PimProduct instance
            clear_existing: Delete old variants before generating new ones

        Returns:
            dict: {'created': count, 'skipped': count, 'total': count}
        """
        from products_pim.models import (
            ProductVariant, VariantAttributeValue,
            CategoryAttribute, AttributeOption
        )

        with transaction.atomic():
            # Get all variant-defining attributes
            variant_attrs = CategoryAttribute.objects.filter(
                category=pim_product.category,
                subcategory=pim_product.subcategory,
                is_variant_defining=True,
                is_active=True
            ).order_by("display_order")

            if not variant_attrs.exists():
                return {'created': 0, 'skipped': 0, 'total': 0}

            # Get all option combinations
            attribute_options = {}
            for attr in variant_attrs:
                options = AttributeOption.objects.filter(
                    attribute=attr,
                    is_active=True
                ).order_by("display_order")
                attribute_options[attr.slug] = [
                    (attr, opt) for opt in options
                ]

            # Generate all combinations
            option_values = list(attribute_options.values())
            combinations = list(itertools_product(*option_values))

            if clear_existing:
                pim_product.variants.all().delete()

            created_count = 0
            skipped_count = 0

            for combo_idx, combination in enumerate(combinations):
                # Build SKU from combination
                sku_parts = [pim_product.code]
                attribute_dict = {}

                for attribute, option in combination:
                    # Generate unique SKU part: if multiple words, use abbrev (e.g., King->K, Queen->Q)
                    # otherwise use first 3 chars of first word
                    words = option.value.split()
                    if len(words) > 1:
                        # Multiple words: use first char of each word (King -> K)
                        slug_part = "".join(w[0] for w in words).upper()
                    else:
                        # Single word: use first 3 chars
                        slug_part = words[0][:3].upper()
                    sku_parts.append(slug_part)
                    attribute_dict[attribute.slug] = (attribute, option)

                sku = "-".join(sku_parts)

                # Check if variant already exists
                if ProductVariant.objects.filter(sku=sku).exists():
                    skipped_count += 1
                    continue

                # Calculate price based on multipliers
                price = Decimal(str(pim_product.base_price))
                for attr_slug, (attribute, option) in attribute_dict.items():
                    multiplier_key = (attr_slug, option.value)
                    if multiplier_key in VariantGenerationService.PRICING_MULTIPLIERS:
                        price += VariantGenerationService.PRICING_MULTIPLIERS[multiplier_key]

                # Create variant
                variant = ProductVariant.objects.create(
                    product=pim_product,
                    sku=sku,
                    price=price,
                    cost_price=pim_product.cost_price,
                    quantity_on_hand=0,
                    reorder_level=2,
                    is_active=True
                )

                # Link attribute values in order
                for attribute, option in combination:
                    VariantAttributeValue.objects.create(
                        variant=variant,
                        attribute=attribute,
                        value_text=option.value
                    )

                created_count += 1

            return {
                'created': created_count,
                'skipped': skipped_count,
                'total': len(combinations)
            }
