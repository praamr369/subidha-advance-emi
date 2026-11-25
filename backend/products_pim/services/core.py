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


def infer_product_type(product) -> str:
    """Infer the correct PIM product classification from product attributes and heuristics."""
    # 0. Explicit classification on operational product or PIM product takes priority
    explicit_type = (
        getattr(product, "item_type", "")
        or getattr(product, "product_type", "")
        or ""
    )
    if explicit_type in ("FINISHED_GOOD", "ACCESSORY", "RAW_MATERIAL", "SERVICE"):
        return explicit_type
    if explicit_type == "ADD_ON":
        return "ACCESSORY"

    code = (getattr(product, "product_code", "") or getattr(product, "code", "") or "").upper()
    name = (getattr(product, "name", "") or "").lower()
    category_val = getattr(product, "category", "") or ""
    cat = str(getattr(category_val, "name", category_val) or "").lower()

    # 1. Explicit code prefixes always take absolute precedence
    if (
        code.startswith("FG-")
        or code.startswith("BED-")
        or code.startswith("SOF-")
        or code.startswith("TAB-")
        or code.startswith("CHR-")
        or code.startswith("ALM-")
        or code.startswith("WRD-")
    ):
        return "FINISHED_GOOD"
    if code.startswith("ACC-") or code.startswith("COMM-PLYB"):
        return "ACCESSORY"
    if code.startswith("RAW-"):
        return "RAW_MATERIAL"
    if code.startswith("SRV-") or code.startswith("SVC-"):
        return "SERVICE"

    # 2. Category checks
    if "raw material" in cat:
        return "RAW_MATERIAL"
    if "service" in cat:
        return "SERVICE"
    if "accessory" in cat or "accessories" in cat:
        return "ACCESSORY"

    # 3. Check for finished furniture indicators in name or category
    furniture_keywords = (
        "bed", "cot", "sofa", "couch", "chair", "table", "desk",
        "wardrobe", "almirah", "cupboard", "cabinet", "dining", "dressing",
        "bookshelf", "showcase", "bench", "stool", "stand", "unit", "rack",
        "divan", "mattress"
    )
    is_furniture_item = (
        "furniture" in cat
        or any(k in name for k in furniture_keywords)
        or any(k in cat for k in furniture_keywords)
    )

    # Check if this is explicitly a part, spare, hardware, or fitting rather than the whole furniture
    is_part_or_fitting = any(
        p in name for p in (
            "fitting", "hardware", "handle", "drawer slide", "hinge", "screw",
            "bracket", "knob", "caster", "wheel", "channel", "cushion cover"
        )
    )

    if is_furniture_item and not is_part_or_fitting:
        # Finished furniture products (e.g. "PlyBoard & Laminates Bed", "Timber Dining Table")
        # are FINISHED_GOOD, even if their name mentions plyboard, timber, laminates, or cushions.
        return "FINISHED_GOOD"

    # 4. Accessories: Commercial Plyboard, cushions, fittings, hardware, handles, drawer slides
    if (
        "plyboard" in name
        or "ply board" in name
        or "commercial ply" in name
        or "cushion" in name
        or "fitting" in name
        or "hardware" in name
        or "handle" in name
        or "drawer slide" in name
        or "hinge" in name
        or "bedside tool" in name
    ):
        return "ACCESSORY"

    # 5. Raw Materials: Timber, screws, nails, adhesive, raw foam sheets
    if (
        "timber" in name
        or "sal wood" in name
        or "screw" in name
        or "foam sheet" in name
        or "adhesive" in name
        or "fevicol" in name
    ):
        return "RAW_MATERIAL"

    # 6. Services: Labor, polish finish, assembly, delivery, repair
    if (
        "service" in name
        or "labor" in name
        or "labour" in name
        or "polish finish" in name
        or "assembly charge" in name
        or "delivery charge" in name
    ):
        return "SERVICE"

    # 7. Explicit classification fallback on operational product or PIM product
    explicit_type = (
        getattr(product, "item_type", "")
        or getattr(product, "product_type", "")
        or ""
    )
    if explicit_type in ("FINISHED_GOOD", "ACCESSORY", "RAW_MATERIAL", "SERVICE"):
        return explicit_type
    if explicit_type == "ADD_ON":
        return "ACCESSORY"

    return "FINISHED_GOOD"


def _resolve_pim_category_and_subcategory(product, initial_type: str):
    """Resolve matching PIM ProductCategory and ProductSubcategory from an operational product."""
    from products_pim.models import ProductCategory, ProductSubcategory

    cat_name = (getattr(product, "category", None) or "").strip()
    sub_name = (getattr(product, "subcategory", None) or "").strip()

    category = None
    if cat_name:
        # Prefer category matching both name and product_type (or ALL)
        category = ProductCategory.objects.filter(
            name__iexact=cat_name,
            product_type__in=[initial_type, "ALL"],
            is_active=True,
        ).first()
        if not category:
            category = ProductCategory.objects.filter(name__iexact=cat_name, is_active=True).first()

    if not category:
        if initial_type in ("ACCESSORY", "RAW_MATERIAL", "SERVICE", "FINISHED_GOOD"):
            category = ProductCategory.objects.filter(
                product_type=initial_type, is_active=True
            ).order_by("display_order", "id").first()
        if not category:
            category, _ = ProductCategory.objects.get_or_create(
                slug="unclassified",
                defaults={"name": "Unclassified", "icon": "📦", "display_order": 999, "product_type": "ALL"},
            )

    subcategory = None
    if sub_name and category:
        subcategory = ProductSubcategory.objects.filter(
            category=category, name__iexact=sub_name, is_active=True
        ).first()

    return category, subcategory


def ensure_pim_product_for_product(product) -> "object | None":
    """Return the PimProduct for an operational product, creating and linking one
    if it does not exist yet. Idempotent and safe to call on every save.
    """
    from products_pim.models import PimProduct

    if not getattr(product, "product_code", ""):
        return None

    # Already linked? Update it to keep it in sync.
    existing = PimProduct.objects.filter(source_product=product).select_related("category", "subcategory").first()
    if existing is not None:
        needs_save = False
        fields_to_update = []
        if existing.code != product.product_code:
            existing.code = product.product_code
            needs_save = True
            fields_to_update.append("code")
        if existing.name != product.name:
            existing.name = product.name
            needs_save = True
            fields_to_update.append("name")
        if existing.base_price != product.base_price:
            existing.base_price = product.base_price
            needs_save = True
            fields_to_update.append("base_price")

        explicit_item_type = (getattr(product, "item_type", None) or "").strip().upper()
        if not existing.product_type:
            existing.product_type = infer_product_type(product)
            needs_save = True
            fields_to_update.append("product_type")
        elif explicit_item_type in ("FINISHED_GOOD", "ACCESSORY", "RAW_MATERIAL", "SERVICE") and existing.product_type != explicit_item_type:
            existing.product_type = explicit_item_type
            needs_save = True
            fields_to_update.append("product_type")

        target_type = existing.product_type or "FINISHED_GOOD"
        cat_text = (getattr(product, "category", None) or "").strip()
        sub_text = (getattr(product, "subcategory", None) or "").strip()
        if existing.category and existing.category.slug == "unclassified":
            resolved_cat, resolved_sub = _resolve_pim_category_and_subcategory(product, target_type)
            if resolved_cat and resolved_cat.id != existing.category_id:
                existing.category = resolved_cat
                existing.subcategory = resolved_sub
                needs_save = True
                fields_to_update.extend(["category", "subcategory"])
        elif cat_text:
            resolved_cat, resolved_sub = _resolve_pim_category_and_subcategory(product, target_type)
            if resolved_cat and resolved_cat.slug != "unclassified" and (
                resolved_cat.id != existing.category_id
                or (resolved_sub and resolved_sub.id != existing.subcategory_id)
            ):
                existing.category = resolved_cat
                existing.subcategory = resolved_sub
                needs_save = True
                fields_to_update.extend(["category", "subcategory"])
        elif sub_text and existing.category_id and not existing.subcategory_id:
            from products_pim.models import ProductSubcategory
            resolved_sub = ProductSubcategory.objects.filter(
                category_id=existing.category_id, name__iexact=sub_text, is_active=True
            ).first()
            if resolved_sub:
                existing.subcategory = resolved_sub
                needs_save = True
                fields_to_update.append("subcategory")

        if needs_save:
            existing.save(update_fields=list(dict.fromkeys(fields_to_update)))
        return existing

    # Link an existing PIM record that matches by code but predates the FK.
    by_code = PimProduct.objects.filter(code=product.product_code).first()
    if by_code is not None:
        fields = ["source_product"]
        if not by_code.product_type:
            by_code.product_type = infer_product_type(product)
            fields.append("product_type")

        if by_code.source_product_id != product.id:
            by_code.source_product = product
            by_code.save(update_fields=fields)
        elif len(fields) > 1:
            by_code.save(update_fields=["product_type"])
        return by_code

    initial_type = infer_product_type(product)
    if initial_type not in ("FINISHED_GOOD", "ACCESSORY", "RAW_MATERIAL", "SERVICE"):
        initial_type = "FINISHED_GOOD"

    category, subcategory = _resolve_pim_category_and_subcategory(product, initial_type)

    # Determine parent if this is a variant
    parent_id = None
    if hasattr(product, 'pim_variant'):
        # Link to the PimProduct corresponding to the variant's parent Operational Product
        parent_id = product.pim_variant.product_id

    # Keep operational product item_type in sync with inferred type if needed
    if getattr(product, "item_type", None) != initial_type and hasattr(product, "pk") and product.pk:
        type(product).objects.filter(pk=product.pk).update(item_type=initial_type)
        product.item_type = initial_type

    return PimProduct.objects.create(
        code=product.product_code,
        source_product=product,
        name=product.name,
        base_price=product.base_price,
        description=getattr(product, "description", "") or "",
        category=category,
        subcategory=subcategory,
        is_active=getattr(product, "is_active", True),
        is_published=False,
        parent_id=parent_id,
        product_type=initial_type,
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

                # Sync to ERP operational product and inventory profile
                try:
                    from products_pim.services.sync_service import PIMSyncService
                    PIMSyncService.sync_variant_to_operational_product(variant)
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).warning("Failed to sync generated variant %s: %s", variant.sku, exc)

                created_count += 1

            return {
                'created': created_count,
                'skipped': skipped_count,
                'total': len(combinations)
            }
