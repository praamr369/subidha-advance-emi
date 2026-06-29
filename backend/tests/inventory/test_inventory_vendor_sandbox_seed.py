from __future__ import annotations

from django.test import TestCase, override_settings

from accounting.models import Vendor, VendorLedgerEntry
from inventory.models import InventoryItem, OpeningStockEntry, OpeningStockEntryStatus, StockLedger, StockMovementType
from inventory.services.local_inventory_vendor_seed_service import (
    PRODUCT_CODE_PREFIX,
    SEED_BATCH_KEY,
    VENDOR_CODE_PREFIX,
    seed_inventory_vendor_sandbox,
)
from subscriptions.models import Product
from tests.helpers import create_admin_user


@override_settings(DEBUG=True)
class InventoryVendorSandboxSeedTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="inventory_seed_admin")

    def test_seed_creates_records_and_is_idempotent(self):
        first = seed_inventory_vendor_sandbox(performed_by=self.admin, item_count=60, vendor_count=6)

        self.assertTrue(first["seeded"])
        self.assertEqual(first["products_total"], 60)
        self.assertEqual(first["inventory_items_total"], 60)
        self.assertEqual(first["opening_stock_entries_total"], 60)
        self.assertEqual(first["opening_stock_entries_posted_now"], 60)
        self.assertEqual(first["vendors_total"], 6)
        self.assertEqual(first["vendor_opening_outstanding_created"], 6)

        self.assertEqual(Product.objects.filter(product_code__startswith=f"{PRODUCT_CODE_PREFIX}-").count(), 60)
        self.assertEqual(InventoryItem.objects.filter(product__product_code__startswith=f"{PRODUCT_CODE_PREFIX}-").count(), 60)
        self.assertEqual(
            OpeningStockEntry.objects.filter(batch__batch_key=SEED_BATCH_KEY, status=OpeningStockEntryStatus.POSTED).count(),
            60,
        )
        self.assertEqual(
            StockLedger.objects.filter(movement_type=StockMovementType.OPENING_BALANCE_IN, reference_model="OpeningStockEntry").count(),
            60,
        )

        vendors = Vendor.objects.filter(vendor_code__startswith=f"{VENDOR_CODE_PREFIX}-")
        self.assertEqual(vendors.count(), 6)
        self.assertEqual(
            VendorLedgerEntry.objects.filter(vendor__in=vendors, entry_type="OPENING_BALANCE", source_type="SANDBOX_SEED").count(),
            6,
        )

        second = seed_inventory_vendor_sandbox(performed_by=self.admin, item_count=60, vendor_count=6)
        self.assertEqual(second["products_total"], 60)
        self.assertEqual(second["inventory_items_total"], 60)
        self.assertEqual(second["opening_stock_entries_total"], 60)
        self.assertEqual(second["opening_stock_entries_posted_now"], 0)
        self.assertEqual(second["vendors_total"], 6)
        self.assertEqual(second["vendor_opening_outstanding_created"], 0)
