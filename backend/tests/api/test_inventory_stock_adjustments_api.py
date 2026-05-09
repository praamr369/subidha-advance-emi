from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, StockAdjustment, StockAdjustmentLine
from inventory.services.stock_service import UNIT_COST_REQUIRED_BEFORE_POSTING_MSG
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
            standard_unit_cost=Decimal("99.00"),
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
        line_payload = response.data["lines"][0]
        self.assertEqual(line_payload["unit_cost_snapshot"], "99.00")

    def test_stock_adjustment_post_returns_400_when_unit_cost_missing(self):
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-API-NOCOST",
            adjustment_date=date(2026, 4, 10),
            reason="Cycle count mismatch",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            unit_cost_snapshot=None,
        )
        approve_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK, approve_resp.data)
        post_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_400_BAD_REQUEST, post_resp.data)
        self.assertEqual(post_resp.data.get("detail"), UNIT_COST_REQUIRED_BEFORE_POSTING_MSG)
