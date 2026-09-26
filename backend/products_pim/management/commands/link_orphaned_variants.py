from django.core.management.base import BaseCommand
from products_pim.models import ProductVariant as PimVariant
from products_core.models import ProductVariant as CoreVariant

class Command(BaseCommand):
    help = 'Links orphaned PIM variants to Core variants by SKU.'

    def handle(self, *args, **options):
        orphans = PimVariant.objects.filter(operational_product__isnull=True)
        count = 0
        for pim_var in orphans:
            try:
                core_var = CoreVariant.objects.get(sku=pim_var.sku)
                # Ensure operational product is set
                pim_var.operational_product = core_var.product
                pim_var.save(update_fields=['operational_product'])
                count += 1
            except CoreVariant.DoesNotExist:
                pass
        self.stdout.write(self.style.SUCCESS(f'Successfully linked {count} orphaned variants.'))
