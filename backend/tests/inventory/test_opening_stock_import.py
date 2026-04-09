from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from inventory.services.opening_stock_import_service import (
    post_opening_stock_import,
    preview_opening_stock_import,
)
from tests.helpers import create_admin_user, create_product


class OpeningStockImportServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="opening_stock_admin",
            phone="9381700001",
        )
        product = create_product(
            name="Opening Stock Chair",
            product_code="OPEN-CHAIR-001",
            base_price=Decimal("5500.00"),
        )
        self.item = InventoryItem.objects.create(
            product=product,
            sku="OPEN-CHAIR-001",
            unit_of_measure="PCS",
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("1.000"),
        )

    def test_preview_and_post_opening_stock_import_are_safe_and_idempotent(self):
        csv_text = (
            "product_code,sku,quantity,location_code,location_name,notes\n"
            "OPEN-CHAIR-001,OPEN-CHAIR-001,4.500,MAIN,Main Store,Initial count\n"
        )

        preview = preview_opening_stock_import(csv_text)

        self.assertEqual(preview["total_rows"], 1)
        self.assertEqual(preview["error_rows"], 0)
        self.assertEqual(preview["ready_rows"], 1)
        self.assertEqual(preview["rows"][0]["action"], "ready")
        self.assertEqual(preview["rows"][0]["location_code"], "MAIN")

        first_post = post_opening_stock_import(
            file_or_text=csv_text,
            movement_date=date(2026, 4, 9),
            posted_by=self.admin,
        )
        second_post = post_opening_stock_import(
            file_or_text=csv_text,
            movement_date=date(2026, 4, 9),
            posted_by=self.admin,
        )

        self.item.refresh_from_db()
        location = StockLocation.objects.get(code="MAIN")
        ledger_entries = StockLedger.objects.filter(
            inventory_item=self.item,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
        )

        self.assertEqual(first_post["created_count"], 1)
        self.assertEqual(first_post["existing_count"], 0)
        self.assertEqual(second_post["created_count"], 0)
        self.assertEqual(second_post["existing_count"], 1)
        self.assertEqual(ledger_entries.count(), 1)
        self.assertEqual(self.item.default_stock_location_id, location.id)
        self.assertEqual(self.item.current_stock_quantity(), Decimal("4.500"))

