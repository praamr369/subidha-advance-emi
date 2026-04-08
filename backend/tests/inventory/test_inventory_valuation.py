from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem
from inventory.services.valuation_service import build_inventory_valuation, create_inventory_valuation_snapshot
from tests.helpers import create_admin_user, create_product


class InventoryValuationTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="valuation_admin", phone="9381600001")
        product = create_product(name="Valuation Product", product_code="VAL-001", base_price=Decimal("900.00"))
        InventoryItem.objects.create(
            product=product,
            sku="VAL-SKU-001",
            opening_stock_qty=Decimal("3.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("600.00"),
        )

    def test_inventory_valuation_and_snapshot_use_live_stock(self):
        report = build_inventory_valuation(as_of_date=date(2026, 4, 23))
        snapshot = create_inventory_valuation_snapshot(as_of_date=date(2026, 4, 23), created_by=self.admin)

        self.assertEqual(report["count"], 1)
        self.assertEqual(report["total_value"], "1800.00")
        self.assertEqual(snapshot.totals_json["total_value"], "1800.00")

