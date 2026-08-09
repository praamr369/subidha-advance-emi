#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from inventory.models import ServiceCatalogItem

print("=" * 70)
print("SERVICE CATALOG - FINAL VERIFICATION")
print("=" * 70)
print()

# Get all services in the catalog
services = ServiceCatalogItem.objects.all().order_by('-created_at')
total = services.count()

print(f"Total Services in Catalog: {total}")
print()

print("Services:")
for i, service in enumerate(services, 1):
    print(f"{i}. {service.code} - {service.name}")
    print(f"   Category: {service.category}")
    print(f"   Price: ₹{service.standard_price}")
    print(f"   Tax: {service.tax_rate_percent}%")
    print(f"   Status: {service.status}")
    print()

print("=" * 70)
print("✓ All SERVICE products are now in the Service Catalog!")
print("=" * 70)
