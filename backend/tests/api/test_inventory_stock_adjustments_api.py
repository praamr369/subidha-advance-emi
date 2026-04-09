from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, StockAdjustment
from tests.helpers import create_admin_user, create_product


class InventoryStockAdjustmentApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="inventory_api_admin",
            phone="9381888001",
        )
        self.client.force_authenticate(user=self.admin)
        product = create_product(
            name="Inventory API Product",
            product_code="INV-API-001",
            base_price=Decimal("1500.00"),
        )
        self.item = InventoryItem.objects.create(
            product=product,
            sku="INV-API-001",
            unit_of_measure="PCS",
            opening_stock_qty=Decimal("3.000"),
        )

    def test_stock_adjustment_create_auto_generates_number_and_sets_creator(self):
        response = self.client.post(
            "/api/v1/inventory/stock-adjustments/",
            {
                "adjustment_no": "",
                "adjustment_date": date(2026, 4, 9).isoformat(),
                "reason": "Cycle count mismatch",
                "lines": [
                    {
                        "inventory_item": self.item.id,
                        "quantity_delta": "-1.000",
                        "notes": "Short count",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        adjustment = StockAdjustment.objects.get(id=response.data["id"])
        self.assertTrue(adjustment.adjustment_no.startswith("ADJ-20260409-"))
        self.assertEqual(adjustment.created_by_id, self.admin.id)
        self.assertEqual(adjustment.reason, "Cycle count mismatch")
