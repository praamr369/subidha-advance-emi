"""Flexible variant generation service for ANY product with dynamic attributes"""
from itertools import product as itertools_product
from decimal import Decimal
from typing import Dict, List, Tuple, Optional
from django.db import transaction

from products_pim.models import (
    ProductVariant, VariantAttributeValue,
    CategoryAttribute, AttributeOption, PimProduct
)


class VariantPreviewResult:
    """Preview of variant combinations without saving"""
    def __init__(self, combinations: List, pricing_map: Dict, total_count: int):
        self.combinations = combinations  # List of [(attr, option), ...]
        self.pricing_map = pricing_map   # {sku_hash -> price}
        self.total_count = total_count
        self.price_range = (
            min(pricing_map.values()) if pricing_map else 0,
            max(pricing_map.values()) if pricing_map else 0
        )

    def to_dict(self):
        return {
            "total_combinations": self.total_count,
            "price_range": {
                "min": float(self.price_range[0]),
                "max": float(self.price_range[1]),
            },
            "sample_skus": [
                {
                    "sku": sku,
                    "price": float(price),
                    "attributes": self._combo_to_dict(combo)
                }
                for sku, price, combo in self.combinations[:10]
            ],
            "total_samples": len(self.combinations),
        }

    def _combo_to_dict(self, combo):
        return {attr.slug: opt.value for attr, opt in combo}


class FlexibleVariantService:
    """Generic variant generation for any product"""

    @staticmethod
    def preview_variants(
        pim_product: PimProduct,
        pricing_rules: Optional[Dict] = None,
        attribute_ids: Optional[List[int]] = None
    ) -> VariantPreviewResult:
        """
        Preview all variant combinations without saving.

        Args:
            pim_product: The product to preview
            pricing_rules: {('attr_slug', 'option_value'): price_multiplier}
            attribute_ids: List of CategoryAttribute IDs to use for generating variants

        Returns:
            VariantPreviewResult with combinations and pricing
        """
        variant_attrs_qs = CategoryAttribute.objects.filter(
            category=pim_product.category,
            subcategory=pim_product.subcategory,
            is_active=True
        )
        
        if attribute_ids is not None:
            variant_attrs = variant_attrs_qs.filter(id__in=attribute_ids).order_by("display_order")
        else:
            variant_attrs = variant_attrs_qs.filter(is_variant_defining=True).order_by("display_order")

        if not variant_attrs.exists() and (attribute_ids is None or len(attribute_ids) > 0):
             # Only return empty if they didn't explicitly ask for 0 attributes, or there are just no attributes
             # Wait, if they select 0 attributes, the combination is just 1 item (the base product).
             pass
             
        if not variant_attrs.exists() and not (attribute_ids is not None and len(attribute_ids) == 0):
            return VariantPreviewResult([], {}, 0)

        # Get all option combinations
        attribute_options = {}
        for attr in variant_attrs:
            options = AttributeOption.objects.filter(
                attribute=attr, is_active=True
            ).order_by("display_order")
            attribute_options[attr.slug] = [(attr, opt) for opt in options]

        # Generate combinations
        option_values = list(attribute_options.values())
        combinations = list(itertools_product(*option_values)) if option_values else [()]

        # Calculate prices
        base_price = Decimal(str(pim_product.base_price))
        pricing_rules = pricing_rules or {}
        pricing_map = {}
        combo_list = []

        for combo in combinations:
            sku = FlexibleVariantService._generate_sku(pim_product.code, combo)
            price = base_price

            for attribute, option in combo:
                key = (attribute.slug, option.value)
                if key in pricing_rules:
                    price += Decimal(str(pricing_rules[key]))

            pricing_map[sku] = price
            combo_list.append((sku, price, combo))

        return VariantPreviewResult(combo_list, pricing_map, len(combinations))

    @staticmethod
    def generate_variants(
        pim_product: PimProduct,
        pricing_rules: Optional[Dict] = None,
        clear_existing: bool = False,
        attribute_ids: Optional[List[int]] = None,
        progress_callback=None
    ) -> Dict:
        """
        Generate and save all variant combinations.

        Args:
            pim_product: The product to generate variants for
            pricing_rules: {('attr_slug', 'option_value'): price_multiplier}
            clear_existing: Delete old variants first
            attribute_ids: List of CategoryAttribute IDs to use for generating variants
            progress_callback: Callable(current, total) for progress tracking

        Returns:
            {
                'created': int,
                'skipped': int,
                'total': int,
                'errors': [str],
            }
        """
        with transaction.atomic():
            # Get variant attributes
            variant_attrs_qs = CategoryAttribute.objects.filter(
                category=pim_product.category,
                subcategory=pim_product.subcategory,
                is_active=True
            )
            
            if attribute_ids is not None:
                variant_attrs = variant_attrs_qs.filter(id__in=attribute_ids).order_by("display_order")
            else:
                variant_attrs = variant_attrs_qs.filter(is_variant_defining=True).order_by("display_order")

            if not variant_attrs.exists() and not (attribute_ids is not None and len(attribute_ids) == 0):
                return {'created': 0, 'skipped': 0, 'total': 0, 'errors': []}

            # Get option combinations
            attribute_options = {}
            for attr in variant_attrs:
                options = AttributeOption.objects.filter(
                    attribute=attr, is_active=True
                ).order_by("display_order")
                attribute_options[attr.slug] = [(attr, opt) for opt in options]

            option_values = list(attribute_options.values())
            combinations = list(itertools_product(*option_values)) if option_values else [()]

            if clear_existing:
                pim_product.variants.all().delete()

            # Generate variants
            base_price = Decimal(str(pim_product.base_price))
            pricing_rules = pricing_rules or {}
            created_count = 0
            skipped_count = 0
            errors = []

            for idx, combo in enumerate(combinations):
                if progress_callback:
                    progress_callback(idx, len(combinations))

                try:
                    sku = FlexibleVariantService._generate_sku(pim_product.code, combo)

                    # Skip if exists
                    if ProductVariant.objects.filter(sku=sku).exists():
                        skipped_count += 1
                        continue

                    # Calculate price
                    price = base_price
                    for attribute, option in combo:
                        key = (attribute.slug, option.value)
                        if key in pricing_rules:
                            price += Decimal(str(pricing_rules[key]))

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

                    # Link attribute values
                    for attribute, option in combo:
                        VariantAttributeValue.objects.create(
                            variant=variant,
                            attribute=attribute,
                            value_text=option.value
                        )

                    created_count += 1

                except Exception as e:
                    errors.append(f"Combo {idx}: {str(e)}")

            if progress_callback:
                progress_callback(len(combinations), len(combinations))

            return {
                'created': created_count,
                'skipped': skipped_count,
                'total': len(combinations),
                'errors': errors,
            }

    @staticmethod
    def bulk_update_variants(
        product_id: int,
        updates: Dict,
        progress_callback=None
    ) -> Dict:
        """
        Bulk update variant properties (price, status, etc).

        Args:
            product_id: Product ID
            updates: {sku: {'price': 100, 'is_active': True, 'qty_on_hand': 5}}
            progress_callback: Callable(current, total)

        Returns:
            {'updated': int, 'skipped': int, 'errors': [str]}
        """
        with transaction.atomic():
            product = PimProduct.objects.get(id=product_id)
            updated_count = 0
            skipped_count = 0
            errors = []

            for idx, (sku, data) in enumerate(updates.items()):
                if progress_callback:
                    progress_callback(idx, len(updates))

                try:
                    variant = ProductVariant.objects.get(
                        product=product, sku=sku
                    )

                    # Update fields
                    if 'price' in data:
                        variant.price = Decimal(str(data['price']))
                    if 'cost_price' in data:
                        variant.cost_price = Decimal(str(data['cost_price']))
                    if 'is_active' in data:
                        variant.is_active = data['is_active']
                    if 'qty_on_hand' in data:
                        variant.quantity_on_hand = int(data['qty_on_hand'])
                    if 'reorder_level' in data:
                        variant.reorder_level = int(data['reorder_level'])
                    if 'barcode' in data:
                        variant.barcode = data['barcode']

                    variant.save()
                    updated_count += 1

                except ProductVariant.DoesNotExist:
                    skipped_count += 1
                except Exception as e:
                    errors.append(f"SKU {sku}: {str(e)}")

            if progress_callback:
                progress_callback(len(updates), len(updates))

            return {
                'updated': updated_count,
                'skipped': skipped_count,
                'errors': errors,
            }

    @staticmethod
    def _generate_sku(product_code: str, combo: Tuple) -> str:
        """Generate SKU from product code and attribute combination"""
        sku_parts = [product_code]

        for attribute, option in combo:
            # Multi-word options: first char of each word
            # Single-word options: first 3 chars
            words = option.value.split()
            if len(words) > 1:
                slug_part = "".join(w[0] for w in words).upper()
            else:
                slug_part = words[0][:3].upper()

            sku_parts.append(slug_part)

        return "-".join(sku_parts)

    @staticmethod
    def get_variant_summary(pim_product: PimProduct) -> Dict:
        """Get quick summary of product variants"""
        variants = pim_product.variants.all()
        prices = [v.price for v in variants]

        return {
            'total_variants': variants.count(),
            'active_variants': variants.filter(is_active=True).count(),
            'price_range': {
                'min': float(min(prices)) if prices else 0,
                'max': float(max(prices)) if prices else 0,
            },
            'total_inventory': sum(v.quantity_on_hand for v in variants),
            'low_stock_count': sum(1 for v in variants if v.is_low_stock),
        }
