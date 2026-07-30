"""Management command to seed the Sagwan Bed product with all attributes and generate variants"""
from django.core.management.base import BaseCommand
from django.db import transaction

from products_pim.models import (
    ProductCategory, ProductSubcategory, CategoryAttribute,
    AttributeOption, PimProduct
)
from products_pim.services import VariantGenerationService


class Command(BaseCommand):
    help = "Seed Sagwan Bed product with variant-defining attributes and generate SKUs"

    def add_arguments(self, parser):
        parser.add_argument(
            '--regenerate',
            action='store_true',
            help='Regenerate variants (delete old ones first)',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.HTTP_INFO("[BED] Setting up Sagwan Bed product..."))

        # 1. Create or get Furniture category
        furniture, created = ProductCategory.objects.get_or_create(
            slug="furniture",
            defaults={"name": "Furniture", "icon": "bed", "display_order": 1}
        )
        if created:
            self.stdout.write(self.style.SUCCESS("[OK] Created Furniture category"))

        # 2. Create or get Beds subcategory
        beds, created = ProductSubcategory.objects.get_or_create(
            category=furniture,
            slug="beds",
            defaults={"name": "Beds", "display_order": 1}
        )
        if created:
            self.stdout.write(self.style.SUCCESS("[OK] Created Beds subcategory"))

        # 3. Define variant-defining attributes
        attributes_config = [
            {
                "name": "Board Type",
                "slug": "board_type",
                "data_type": "CHOICE",
                "options": ["Solid", "Panel"],
                "is_variant": True
            },
            {
                "name": "Thickness",
                "slug": "thickness",
                "data_type": "TEXT",
                "options": ["1.5 inch", "2 inch"],
                "is_variant": True
            },
            {
                "name": "Size",
                "slug": "size",
                "data_type": "CHOICE",
                "options": ["3/6 Single", "4/6 Single", "5/7 Queen", "6/7 Queen", "6/7 King"],
                "is_variant": True
            },
            {
                "name": "Storage",
                "slug": "storage",
                "data_type": "CHOICE",
                "options": ["No Storage", "Foldable Storage"],
                "is_variant": True
            },
            {
                "name": "Base Material",
                "slug": "base_material",
                "data_type": "CHOICE",
                "options": ["Iron", "Saal"],
                "is_variant": True
            },
            {
                "name": "Ply Setup",
                "slug": "ply_setup",
                "data_type": "CHOICE",
                "options": ["Commercial 18mm/12mm", "Waterproof 18mm/12mm"],
                "is_variant": True
            },
            {
                "name": "Polish",
                "slug": "polish",
                "data_type": "CHOICE",
                "options": ["Hand Polish", "Gun Polish"],
                "is_variant": True
            }
        ]

        # Create attributes
        for idx, attr_cfg in enumerate(attributes_config):
            attr, created = CategoryAttribute.objects.get_or_create(
                category=furniture,
                subcategory=beds,
                slug=attr_cfg["slug"],
                defaults={
                    "name": attr_cfg["name"],
                    "data_type": attr_cfg["data_type"],
                    "is_variant_defining": attr_cfg["is_variant"],
                    "display_order": idx,
                    "is_active": True
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f"  [+] Created attribute: {attr_cfg['name']}"))

            # Add options
            for opt_idx, option_value in enumerate(attr_cfg["options"]):
                AttributeOption.objects.get_or_create(
                    attribute=attr,
                    value=option_value,
                    defaults={"display_name": option_value, "display_order": opt_idx}
                )

            # Count options
            option_count = attr.options.count()
            self.stdout.write(f"    -> {option_count} options")

        self.stdout.write(self.style.SUCCESS("[OK] All attributes configured"))

        # 4. Create or get Sagwan Bed product
        product, created = PimProduct.objects.get_or_create(
            code="SB-001",
            defaults={
                "name": "Sagwan Bed",
                "description": "Premium Sagwan wood bed with customizable options - headboard, footboard, various sizes and finishes",
                "category": furniture,
                "subcategory": beds,
                "base_price": 15000.00,
                "cost_price": 8000.00,
                "is_active": True,
                "is_published": False
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS("[OK] Created Sagwan Bed product"))
        else:
            self.stdout.write(self.style.WARNING("[!] Sagwan Bed product already exists"))

        # 5. Generate or regenerate variants
        self.stdout.write(self.style.HTTP_INFO("\n[SKU] Generating SKU variants..."))

        result = VariantGenerationService.generate_variants_for_product(
            product,
            clear_existing=options['regenerate']
        )

        created = result['created']
        skipped = result['skipped']
        total = result['total']

        self.stdout.write(
            self.style.SUCCESS(
                f"[OK] Generated {created} new variants"
            )
        )
        if skipped > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"[!] {skipped} variants already existed"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n[DONE] Complete! {product.variants.count()} total SKUs ready"
            )
        )

        # Display sample variants
        samples = product.variants.all()[:5]
        if samples:
            self.stdout.write("\n[SAMPLES] SKUs:")
            for variant in samples:
                attrs = " | ".join(
                    av.value_text for av in variant.attribute_values.all()
                )
                self.stdout.write(
                    f"  {variant.sku}: INR {variant.price} ({attrs})"
                )
            self.stdout.write(f"  ... and {product.variants.count() - 5} more")
