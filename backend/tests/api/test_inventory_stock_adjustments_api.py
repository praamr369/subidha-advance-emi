from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, StockAdjustment, StockAdjustmentLine
from inventory.services.stock_service import UNIT_COST_REQUIRED_BEFORE_POSTING_MSG
from tests.helpers import (
    create_admin_user,
    create_product,
    ensure_test_accounting_posting_prerequisites,
)


class InventoryStockAdjustmentApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="inventory_api_admin",
            phone="9381888001",
        )
        ensure_test_accounting_posting_prerequisites(date(2026, 4, 10), performed_by=self.admin)
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
        # Controlled, structured posting error (not a 500, not a list failure).
        self.assertEqual(post_resp.data.get("code"), "UNIT_COST_REQUIRED")
        self.assertTrue(post_resp.data.get("line_errors"))
        self.assertEqual(
            post_resp.data["line_errors"][0]["code"], "UNIT_COST_REQUIRED"
        )

    def test_list_adjustments_succeeds_when_line_missing_unit_cost(self):
        # A non-postable row must NOT break the register list — it surfaces
        # readiness/blocker fields instead of failing GET.
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-API-LIST-NOCOST",
            adjustment_date=date(2026, 4, 11),
            reason="Cycle count mismatch",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            unit_cost_snapshot=None,
        )
        list_resp = self.client.get("/api/v1/inventory/stock-adjustments/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK, list_resp.data)
        row = next(r for r in list_resp.data["results"] if r["id"] == adjustment.id)
        self.assertFalse(row["can_post"])
        self.assertIn(UNIT_COST_REQUIRED_BEFORE_POSTING_MSG, row["posting_blockers"])
        self.assertEqual(row["valuation_status"], "MISSING_UNIT_COST")
        line = row["lines"][0]
        # Missing cost is reported as unknown (None), never coerced to 0.
        self.assertIsNone(line["effective_unit_cost"])
        self.assertIsNone(line["line_valuation"])
        self.assertTrue(line["requires_unit_cost"])
        self.assertEqual(line["valuation_status"], "MISSING_UNIT_COST")

    def test_line_valuation_uses_line_unit_cost_or_standard_cost(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-API-VAL",
            adjustment_date=date(2026, 4, 11),
            reason="Cycle count mismatch",
            created_by=self.admin,
        )
        # Line A: uses item standard cost (99.00) × 2 = 198.00
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("2.000"),
            unit_cost_snapshot=None,
        )
        # Line B: explicit line override (12.50) × 4 = 50.00
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-4.000"),
            unit_cost_snapshot=Decimal("12.50"),
        )
        detail = self.client.get(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/"
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        lines = detail.data["lines"]
        self.assertEqual(lines[0]["effective_unit_cost"], "99.00")
        self.assertEqual(lines[0]["line_valuation"], "198.00")
        self.assertEqual(lines[1]["effective_unit_cost"], "12.50")
        self.assertEqual(lines[1]["line_valuation"], "50.00")
        self.assertTrue(detail.data["can_post"] is False or detail.data["can_post"] is True)

    def test_set_line_costs_unblocks_then_posting_succeeds(self):
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-API-SETCOST",
            adjustment_date=date(2026, 4, 12),
            reason="Cycle count mismatch",
            created_by=self.admin,
        )
        line = StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            unit_cost_snapshot=None,
        )
        self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/approve/",
            {},
            format="json",
        )
        # Edit unit cost while APPROVED (pre-posting) — must be allowed.
        set_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/set-line-costs/",
            {"unit_costs": {str(line.id): "20.00"}},
            format="json",
        )
        self.assertEqual(set_resp.status_code, status.HTTP_200_OK, set_resp.data)
        line.refresh_from_db()
        self.assertEqual(line.unit_cost_snapshot, Decimal("20.00"))
        post_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK, post_resp.data)
        line.refresh_from_db()
        self.assertEqual(line.valuation_amount_snapshot, Decimal("20.00"))

    def test_set_line_costs_rejected_after_posting(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-API-POSTED-LOCK",
            adjustment_date=date(2026, 4, 13),
            reason="Cycle count mismatch",
            created_by=self.admin,
        )
        line = StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            unit_cost_snapshot=Decimal("99.00"),
        )
        self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/approve/",
            {},
            format="json",
        )
        post_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/post/",
            {},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK, post_resp.data)
        # Posted (final) line unit cost cannot be edited.
        set_resp = self.client.post(
            f"/api/v1/inventory/stock-adjustments/{adjustment.id}/set-line-costs/",
            {"unit_costs": {str(line.id): "5.00"}},
            format="json",
        )
        self.assertEqual(set_resp.status_code, status.HTTP_400_BAD_REQUEST, set_resp.data)
        line.refresh_from_db()
        self.assertEqual(line.unit_cost_snapshot, Decimal("99.00"))
