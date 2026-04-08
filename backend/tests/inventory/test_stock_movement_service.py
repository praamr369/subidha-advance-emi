from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockMovementType
from inventory.services.stock_service import create_stock_ledger_entry
from tests.helpers import create_admin_user, create_product


class StockMovementServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="stock_movement_admin", phone="9381500001")
        product = create_product(name="Stock Service Product", product_code="SSP-001", base_price=Decimal("800.00"))
        self.item = InventoryItem.objects.create(
            product=product,
            sku="SSP-SKU-001",
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("1.000"),
        )

    def test_create_stock_ledger_entry_is_idempotent_by_reference(self):
        first_entry, created = create_stock_ledger_entry(
            inventory_item=self.item,
            movement_type=StockMovementType.ADJUSTMENT_IN,
            movement_date=date(2026, 4, 23),
            quantity_in=Decimal("2.000"),
            reference_model="ManualAdjustment",
            reference_id="MA-001",
            posted_by=self.admin,
        )
        second_entry, created_again = create_stock_ledger_entry(
            inventory_item=self.item,
            movement_type=StockMovementType.ADJUSTMENT_IN,
            movement_date=date(2026, 4, 23),
            quantity_in=Decimal("2.000"),
            reference_model="ManualAdjustment",
            reference_id="MA-001",
            posted_by=self.admin,
        )

        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first_entry.id, second_entry.id)

