import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
django.setup()

from inventory.models import InventoryItem
items = InventoryItem.objects.all()
print([(i.sku, i.standard_unit_cost) for i in items[:5]])
