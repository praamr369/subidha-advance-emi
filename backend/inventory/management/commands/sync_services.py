"""
Management command to sync SERVICE products from the Product model to ServiceCatalogItem.
This is useful for backfilling existing services that were created before the signal was added.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from products_core.models import Product
from inventory.models import ServiceCatalogItem, ServiceCatalogItemStatus, ServiceType


class Command(BaseCommand):
    help = "Sync SERVICE products from Product model to ServiceCatalogItem model"

    def add_arguments(self, parser):
        parser.add_argument(
            '--delete-orphans',
            action='store_true',
            help='Delete ServiceCatalogItems that no longer have a corresponding SERVICE product',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting service synchronization..."))
        self.stdout.write()

        # Get all SERVICE products
        service_products = Product.objects.filter(item_type='SERVICE')
        total_services = service_products.count()

        self.stdout.write(f"Found {total_services} SERVICE products to sync")
        self.stdout.write()

        created_count = 0
        updated_count = 0
        error_count = 0

        with transaction.atomic():
            for product in service_products:
                try:
                    # Map product category to service category
                    service_category = (
                        product.category or
                        (product.category_master.name if product.category_master else "Uncategorized")
                    )

                    # Map GST rate to tax_rate_percent
                    tax_rate = product.gst_rate or 18.00

                    # Get or create ServiceCatalogItem
                    catalog_item, created = ServiceCatalogItem.objects.get_or_create(
                        code=product.product_code,
                        defaults={
                            'name': product.name,
                            'description': product.description,
                            'category': service_category,
                            'service_type': ServiceType.OTHER,
                            'standard_price': product.base_price,
                            'tax_rate_percent': tax_rate,
                            'status': ServiceCatalogItemStatus.ACTIVE if product.is_active else ServiceCatalogItemStatus.INACTIVE,
                            'hsn_sac_code': product.hsn_sac_code,
                        }
                    )

                    if created:
                        created_count += 1
                        self.stdout.write(f"  ✓ Created: {product.product_code} - {product.name}")
                    else:
                        # Update existing item
                        catalog_item.name = product.name
                        catalog_item.description = product.description
                        catalog_item.category = service_category
                        catalog_item.standard_price = product.base_price
                        catalog_item.tax_rate_percent = tax_rate
                        catalog_item.status = ServiceCatalogItemStatus.ACTIVE if product.is_active else ServiceCatalogItemStatus.INACTIVE
                        catalog_item.hsn_sac_code = product.hsn_sac_code
                        catalog_item.save()
                        updated_count += 1
                        self.stdout.write(f"  ↻ Updated: {product.product_code}")

                except Exception as e:
                    error_count += 1
                    self.stdout.write(
                        self.style.ERROR(f"  ✗ Error syncing {product.product_code}: {str(e)}")
                    )

        self.stdout.write()
        self.stdout.write(f"Created: {created_count}")
        self.stdout.write(f"Updated: {updated_count}")
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f"Errors: {error_count}"))
        self.stdout.write()

        # Handle orphans if requested
        if options.get('delete_orphans'):
            self.stdout.write("Checking for orphaned ServiceCatalogItems...")
            catalog_items = ServiceCatalogItem.objects.all()
            orphaned_codes = [
                item.code for item in catalog_items
                if not Product.objects.filter(
                    product_code=item.code,
                    item_type='SERVICE'
                ).exists()
            ]

            if orphaned_codes:
                orphan_count = len(orphaned_codes)
                self.stdout.write(f"Found {orphan_count} orphaned ServiceCatalogItems")
                ServiceCatalogItem.objects.filter(code__in=orphaned_codes).delete()
                self.stdout.write(f"Deleted {orphan_count} orphaned items")
            else:
                self.stdout.write("No orphaned items found")

        self.stdout.write(self.style.SUCCESS("Service synchronization complete!"))
