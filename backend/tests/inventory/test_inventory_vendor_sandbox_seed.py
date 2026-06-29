from __future__ import annotations

from django.test import TestCase, override_settings

from inventory.services.local_inventory_vendor_seed_service import seed_inventory_vendor_sandbox
from tests.helpers import create_admin_user


@override_settings(DEBUG=True)
class InventoryVendorSandboxSeedTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="inventory_seed_admin")

    def test_seed_returns_expected_summary(self):
        result = seed_inventory_vendor_sandbox(performed_by=self.admin, item_count=60, vendor_count=6)

        self.assertTrue(result["seeded"])
        self.assertEqual(result["products_total"], 60)
        self.assertEqual(result["inventory_items_total"], 60)
        self.assertEqual(result["opening_stock_entries_total"], 60)
        self.assertEqual(result["vendors_total"], 6)
        self.assertEqual(result["vendor_opening_outstanding_created"], 6)
