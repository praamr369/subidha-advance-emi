from django.core.management.base import BaseCommand
from inventory.models import InventoryItem, OpeningStockEntryStatus

class Command(BaseCommand):
    help = 'Backfills default_stock_location from POSTED OpeningStockEntry rows for items that are Unassigned.'

    def handle(self, *args, **options):
        items = InventoryItem.objects.filter(default_stock_location__isnull=True)
        count = 0
        for item in items:
            first_posted = item.opening_stock_entries.filter(
                status=OpeningStockEntryStatus.POSTED, 
                stock_location__isnull=False
            ).first()
            
            if first_posted:
                item.default_stock_location = first_posted.stock_location
                item.save(update_fields=["default_stock_location", "updated_at"])
                count += 1
                self.stdout.write(f"Updated {item.product.name} -> {first_posted.stock_location.name}")
                
        self.stdout.write(self.style.SUCCESS(f"Successfully fixed {count} unassigned inventory profiles."))
