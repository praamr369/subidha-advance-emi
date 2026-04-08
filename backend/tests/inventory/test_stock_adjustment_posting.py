from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockAdjustment, StockAdjustmentLine, StockAdjustmentStatus, StockLedger
from inventory.services.stock_service import approve_stock_adjustment, post_stock_adjustment
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
        )

    def test_stock_adjustment_posting_creates_stock_ledger(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-20260408-001",
            adjustment_date=date(2026, 4, 8),
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

