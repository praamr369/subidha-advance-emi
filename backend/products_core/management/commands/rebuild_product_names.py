import logging
from django.core.management.base import BaseCommand
from products_pim.models import ProductVariant
from products_core.models import Product
from products_pim.services.sync_service import PIMSyncService
from django.db import transaction

class Command(BaseCommand):
    help = "Rebuild operational product names from PIM variants (removes hardcoded SKUs from names)."

    def handle(self, *args, **options):
        variants = ProductVariant.objects.select_related("product").prefetch_related("attribute_values__attribute")
        count = 0
        with transaction.atomic():
            for v in variants:
                if v.operational_product:
                    new_name = PIMSyncService.get_variant_display_name(v)
                    if v.operational_product.name != new_name:
                        v.operational_product.name = new_name
                        v.operational_product.save(update_fields=['name'])
                        count += 1
                        
            # Also fix products that don't have operational_product explicitly linked but match by SKU
            unlinked_products = Product.objects.filter(pim_variant__isnull=True)
            for p in unlinked_products:
                v = ProductVariant.objects.filter(sku=p.product_code).first()
                if v:
                    new_name = PIMSyncService.get_variant_display_name(v)
                    if p.name != new_name:
                        p.name = new_name
                        p.save(update_fields=['name'])
                        count += 1
                        
        self.stdout.write(self.style.SUCCESS(f"Rebuilt names for {count} products."))
