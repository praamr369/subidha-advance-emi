from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import (
    InventoryAdjustment,
    InventoryItem,
    InternalStockMovementType,
    StockAdjustment,
    StockLedgerEntry,
    StockLocation,
    StockMovementType,
    StockReservation,
    Warehouse,
)
from inventory.services.demand_planning_service import (
    calculate_product_demand,
    get_product_stock_availability,
    stock_status_for_delivery,
    upsert_purchase_need_for_product,
)
from inventory.services.stock_service import create_stock_ledger_entry
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DemandPlanningModuleTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="inv_admin", phone="9820001122")
        self.customer = create_customer_profile(name="Inventory Customer", phone="9820001123")
        self.product = create_product(
            name="Inventory Product",
            product_code="INV-PLAN-01",
            base_price=Decimal("10000.00"),
        )
        self.location = StockLocation.objects.create(code="INV-WH1", name="Inventory WH")
        self.warehouse = Warehouse.objects.create(code="WH1", name="Main Warehouse", stock_location=self.location)
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="INV-PLAN-01",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("2.000"),
        )

    def test_stock_ledger_movement_entry_created(self):
        entry = StockLedgerEntry.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type=InternalStockMovementType.IN,
            quantity=Decimal("2.000"),
            source_module="tests.inventory",
            source_object_id="seed-1",
            created_by=self.admin,
            note="seed in",
        )
        self.assertEqual(entry.movement_type, InternalStockMovementType.IN)

    def test_reservation_calculation_reflects_soft_hold(self):
        create_stock_ledger_entry(
            inventory_item=self.item,
            movement_type=StockMovementType.SALE_RESERVE,
            movement_date=date.today(),
            quantity_in=Decimal("1.000"),
            reference_model="Test",
            reference_id="reserve-1",
            posted_by=self.admin,
        )
        StockReservation.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            quantity=Decimal("1.000"),
            source_module="tests.inventory",
            source_object_id="reserve-1",
            created_by=self.admin,
        )
        availability = get_product_stock_availability(product_id=self.product.id)
        self.assertEqual(availability["reserved"], "1.000")

    def test_demand_planning_result_contains_expected_inputs(self):
        batch = create_batch(
            batch_code="INVPLANLOCK",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 1, 1),
            status="LOCKED",
        )
        create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=create_lucky_id(batch=batch, lucky_number=21),
            total_amount=Decimal("10000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=10,
        )
        payload = calculate_product_demand(product_id=self.product.id)
        self.assertIn("active_subscriptions", payload)
        self.assertIn("locked_batch_demand", payload)

    def test_purchase_need_generated_for_shortage(self):
        batch = create_batch(
            batch_code="INVPLANPN",
            duration_months=9,
            total_slots=100,
            draw_day=6,
            start_date=date(2026, 1, 1),
        )
        create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=create_lucky_id(batch=batch, lucky_number=22),
            total_amount=Decimal("9000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=9,
        )
        need = upsert_purchase_need_for_product(product_id=self.product.id, created_by=self.admin)
        self.assertIsNotNone(need)

    def test_adjustment_audit_record_created(self):
        adjustment = StockAdjustment.objects.create(
            adjustment_no="ADJ-AUDIT-1",
            adjustment_date=date.today(),
            reason="Count variance",
            created_by=self.admin,
            stock_location=self.location,
        )
        audit = InventoryAdjustment.objects.create(
            stock_adjustment=adjustment,
            audit_reason="Cycle count mismatch",
            created_by=self.admin,
        )
        self.assertEqual(audit.stock_adjustment_id, adjustment.id)

    def test_delivery_stock_indicator(self):
        payload = stock_status_for_delivery(product_id=self.product.id)
        self.assertIn(payload["status"], {"available", "not available", "reserved", "purchase needed"})
