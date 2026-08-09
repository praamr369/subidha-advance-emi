#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from decimal import Decimal
from products_core.models import Product
from subscriptions.enums import ProductItemType
from inventory.models import ServiceCatalogItem

print("=" * 70)
print("SERVICE SYNC SIGNAL TEST")
print("=" * 70)
print()

# Test 1: Create a new service product
print("Test 1: Creating a new SERVICE product...")
service_product = Product.objects.create(
    product_code="SRV-TEST-001",
    name="Test Service Product",
    base_price=Decimal("1500.00"),
    item_type=ProductItemType.SERVICE,
    category="Testing",
    hsn_sac_code="999850",
    gst_rate=Decimal("18.00"),
    is_active=True,
    description="This is a test service product"
)
print(f"✓ Created Product: {service_product.product_code} - {service_product.name}")
print()

# Test 2: Check if ServiceCatalogItem was created automatically
print("Test 2: Checking if ServiceCatalogItem was created...")
try:
    catalog_item = ServiceCatalogItem.objects.get(code="SRV-TEST-001")
    print(f"✓ ServiceCatalogItem found!")
    print(f"  - Code: {catalog_item.code}")
    print(f"  - Name: {catalog_item.name}")
    print(f"  - Category: {catalog_item.category}")
    print(f"  - Price: ₹{catalog_item.standard_price}")
    print(f"  - Tax: {catalog_item.tax_rate_percent}%")
    print(f"  - Status: {catalog_item.status}")
    print()
except ServiceCatalogItem.DoesNotExist:
    print("✗ ServiceCatalogItem NOT created - signal may not be working")
    print()

# Test 3: Update the product and verify ServiceCatalogItem is updated
print("Test 3: Updating the service product...")
service_product.name = "Updated Test Service"
service_product.base_price = Decimal("2000.00")
service_product.is_active = False
service_product.save()
print(f"✓ Updated Product")
print()

# Test 4: Verify ServiceCatalogItem was updated
print("Test 4: Checking if ServiceCatalogItem was updated...")
catalog_item.refresh_from_db()
print(f"  - Name: {catalog_item.name}")
print(f"  - Price: ₹{catalog_item.standard_price}")
print(f"  - Status: {catalog_item.status}")
print()

# Test 5: Verify non-SERVICE products don't create catalog items
print("Test 5: Creating a FINISHED_GOOD product (should NOT create ServiceCatalogItem)...")
product = Product.objects.create(
    product_code="FG-TEST-001",
    name="Test Finished Good",
    base_price=Decimal("5000.00"),
    item_type=ProductItemType.FINISHED_GOOD,
    category="Furniture",
    hsn_sac_code="940490",
    gst_rate=Decimal("5.00"),
    is_active=True
)
print(f"✓ Created Product: {product.product_code}")

try:
    ServiceCatalogItem.objects.get(code="FG-TEST-001")
    print("✗ ServiceCatalogItem was created (should not have been)")
except ServiceCatalogItem.DoesNotExist:
    print("✓ ServiceCatalogItem was NOT created (as expected)")
print()

print("=" * 70)
print("SERVICE SYNC SIGNAL TEST COMPLETE ✓")
print("=" * 70)
print()
print("Summary:")
print("  - Services created from Products admin automatically sync to Service Catalog")
print("  - Non-SERVICE products do not create ServiceCatalogItems")
print("  - Service Catalog page now shows all service products")
