#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from inventory.models import StockReservation, InventoryItem, Warehouse
from django.contrib.auth import get_user_model

User = get_user_model()

# Get or create admin user
admin = User.objects.filter(username='admin').first()
if not admin:
    admin = User.objects.create_superuser('admin', 'admin@example.com', 'admin@123')
    print(f"Created admin user")

# Get first warehouse and some inventory items
warehouse = Warehouse.objects.first()
if not warehouse:
    print("No warehouse found!")
    exit(1)

inventory_items = InventoryItem.objects.filter(stock_tracking_enabled=True)[:3]
if not inventory_items:
    print("No inventory items found!")
    exit(1)

# Create sample reservations
reservations = [
    {
        'product': inventory_items[0].product,
        'warehouse': warehouse,
        'quantity': 5,
        'status': 'ACTIVE',
        'source_module': 'SUBSCRIPTION',
        'source_object_id': '1024',
        'created_by': admin,
        'note': 'Reserved for Subscription #1024 (EMI)',
    },
    {
        'product': inventory_items[1].product,
        'warehouse': warehouse,
        'quantity': 3,
        'status': 'ACTIVE',
        'source_module': 'DIRECT_SALE',
        'source_object_id': '4500',
        'created_by': admin,
        'note': 'Reserved for Direct Sale #4500',
    },
    {
        'product': inventory_items[2].product,
        'warehouse': warehouse,
        'quantity': 2,
        'status': 'ACTIVE',
        'source_module': 'DELIVERY',
        'source_object_id': 'DEL-2024-0156',
        'created_by': admin,
        'note': 'Reserved for Delivery DEL-2024-0156',
    },
    {
        'product': inventory_items[0].product,
        'warehouse': warehouse,
        'quantity': 8,
        'status': 'RELEASED',
        'source_module': 'SUBSCRIPTION',
        'source_object_id': '1023',
        'created_by': admin,
        'note': 'Released - Subscription #1023 completed',
    },
]

for data in reservations:
    StockReservation.objects.create(**data)

print(f"Created {len(reservations)} sample stock reservations")
print(f"  - {sum(1 for r in reservations if r['status'] == 'ACTIVE')} ACTIVE")
print(f"  - {sum(1 for r in reservations if r['status'] == 'RELEASED')} RELEASED")
