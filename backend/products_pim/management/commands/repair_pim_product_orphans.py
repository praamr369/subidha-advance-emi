from django.core.management.base import BaseCommand
from products_pim.models import PimProduct, ProductVariant

class Command(BaseCommand):
    help = 'Repairs PimProduct orphans (variants that incorrectly act as roots).'

    def handle(self, *args, **options):
        # Find all root PimProducts
        orphans = PimProduct.objects.filter(parent__isnull=True)
        count = 0
        for pim in orphans:
            # Check if this PIM product's code is actually a variant SKU
            variant = ProductVariant.objects.filter(sku=pim.code).select_related('product').first()
            if variant and variant.product_id != pim.id:
                pim.parent_id = variant.product_id
                pim.product_type = variant.product.product_type
                pim.save(update_fields=['parent_id', 'product_type'])
                self.stdout.write(f"Linked orphaned variant {pim.code} to base product {variant.product.code}")
                count += 1
                
        self.stdout.write(self.style.SUCCESS(f'Successfully repaired {count} orphaned variant PimProducts.'))
