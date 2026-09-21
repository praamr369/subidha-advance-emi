from django.core.management.base import BaseCommand
from inventory.models import InventoryItem, OpeningStockEntryStatus

class Command(BaseCommand):
    help = 'Backfills default_stock_location and standard_unit_cost from POSTED OpeningStockEntry rows for items.'

    def handle(self, *args, **options):
        items = InventoryItem.objects.all()
        loc_count = 0
        cost_count = 0
        for item in items:
            first_posted = item.opening_stock_entries.filter(
                status=OpeningStockEntryStatus.POSTED
            ).first()
            
            if first_posted:
                updates = []
                if item.default_stock_location is None and first_posted.stock_location:
                    item.default_stock_location = first_posted.stock_location
                    updates.append("default_stock_location")
                    loc_count += 1
                
                if item.standard_unit_cost is None and first_posted.unit_cost_snapshot is not None:
                    item.standard_unit_cost = first_posted.unit_cost_snapshot
                    updates.append("standard_unit_cost")
                    cost_count += 1
                    
                if updates:
                    updates.append("updated_at")
                    item.save(update_fields=updates)
                    self.stdout.write(f"Updated {item.product.name} -> {updates}")
                
        self.stdout.write(self.style.SUCCESS(f"Fixed {loc_count} locations and {cost_count} costs."))
