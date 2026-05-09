from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockAdjustment, StockAdjustmentLine, StockAdjustmentStatus, StockLedger
from inventory.services.stock_service import (
    UNIT_COST_REQUIRED_BEFORE_POSTING_MSG,
    approve_stock_adjustment,
    post_stock_adjustment,
)
from tests.helpers import create_admin_user, create_product


class StockAdjustmentPostingTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="stock_adjustment_admin",
            phone="9384000001",
        )
        product = create_product(
            name="Adjustment Product",
            product_code="STK-ADJ-001",
            base_price=Decimal("600.00"),
        )
        self.item = InventoryItem.objects.create(
            product=product,
            sku="STK-ADJ-SKU-001",
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("50.00"),
        )

    def test_stock_adjustment_posting_creates_stock_ledger(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-001",
            adjustment_date=date(2026, 4, 8),
            reason="Counted stock shortage",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-2.000"),
            notes="Counted shortage",
        )

        approved_adjustment, approved = approve_stock_adjustment(
            stock_adjustment_id=adjustment.id,
            approved_by=self.admin,
        )
        self.assertTrue(approved)
        self.assertEqual(approved_adjustment.status, StockAdjustmentStatus.APPROVED)

        posted_adjustment, posted = post_stock_adjustment(
            stock_adjustment_id=adjustment.id,
            posted_by=self.admin,
        )
        self.assertTrue(posted)
        self.assertEqual(posted_adjustment.status, StockAdjustmentStatus.POSTED)
        self.assertEqual(
            StockLedger.objects.filter(reference_model="StockAdjustmentLine").count(),
            1,
        )
        line = StockAdjustmentLine.objects.get(stock_adjustment=posted_adjustment)
        self.assertEqual(line.unit_cost_snapshot, Decimal("50.00"))
        self.assertEqual(line.valuation_amount_snapshot, Decimal("100.00"))

    def test_stock_adjustment_posting_requires_unit_cost_source(self):
        self.item.standard_unit_cost = None
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-NOCOST",
            adjustment_date=date(2026, 4, 8),
            reason="Counted shortage without standard cost",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            notes="Needs explicit cost",
            unit_cost_snapshot=None,
        )
        approve_stock_adjustment(stock_adjustment_id=adjustment.id, approved_by=self.admin)
        with self.assertRaisesMessage(ValueError, UNIT_COST_REQUIRED_BEFORE_POSTING_MSG):
            post_stock_adjustment(stock_adjustment_id=adjustment.id, posted_by=self.admin)

    def test_stock_adjustment_posting_respects_explicit_line_unit_cost_snapshot(self):
        self.item.standard_unit_cost = Decimal("40.00")
        self.item.save(update_fields=["standard_unit_cost", "updated_at"])
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-OVR",
            adjustment_date=date(2026, 4, 8),
            reason="Use explicit snapshot",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-2.000"),
            notes="Explicit cost",
            unit_cost_snapshot=Decimal("75.00"),
        )
        approve_stock_adjustment(stock_adjustment_id=adjustment.id, approved_by=self.admin)
        posted_adjustment, posted = post_stock_adjustment(
            stock_adjustment_id=adjustment.id,
            posted_by=self.admin,
        )
        self.assertTrue(posted)
        line = StockAdjustmentLine.objects.get(stock_adjustment=posted_adjustment)
        self.assertEqual(line.unit_cost_snapshot, Decimal("75.00"))
        self.assertEqual(line.valuation_amount_snapshot, Decimal("150.00"))

    def test_stock_adjustment_double_post_is_idempotent_for_ledger(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-IDEM",
            adjustment_date=date(2026, 4, 8),
            reason="Idempotent posting",
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("-1.000"),
            notes="",
        )
        approve_stock_adjustment(stock_adjustment_id=adjustment.id, approved_by=self.admin)
        posted_adjustment, first = post_stock_adjustment(
            stock_adjustment_id=adjustment.id,
            posted_by=self.admin,
        )
        self.assertTrue(first)
        ledger_count = StockLedger.objects.filter(reference_model="StockAdjustmentLine").count()
        again_adjustment, second = post_stock_adjustment(
            stock_adjustment_id=posted_adjustment.id,
            posted_by=self.admin,
        )
        self.assertFalse(second)
        self.assertEqual(
            StockLedger.objects.filter(reference_model="StockAdjustmentLine").count(),
            ledger_count,
        )

    def test_stock_adjustment_approval_requires_reason(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-002",
            adjustment_date=date(2026, 4, 8),
            created_by=self.admin,
        )
        StockAdjustmentLine.objects.create(
            stock_adjustment=adjustment,
            inventory_item=self.item,
            quantity_delta=Decimal("1.000"),
            notes="Counted surplus",
        )

        with self.assertRaisesMessage(ValueError, "Reason is required before approving a stock adjustment."):
            approve_stock_adjustment(
                stock_adjustment_id=adjustment.id,
                approved_by=self.admin,
            )
