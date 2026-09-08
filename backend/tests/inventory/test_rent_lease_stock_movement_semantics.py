"""RENT / LEASE stock movements are distinct from Advance EMI.

An Advance EMI handover is a sale-like outflow — ownership transfers to the
customer on completion, so the cost belongs in COGS. A RENT or LEASE handover
puts the asset out on hire: it stays the company's asset, it is expected back,
and it must NOT be expensed.

Before this split, every handover was written as ``EMI_DELIVERY_OUT``, which
meant rent assets were silently expensed as COGS and never came back into stock.
These tests pin the plan-aware behaviour end to end: movement type, physical
stock effect, return restocking, and the accounting classification.
"""
from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase

from accounting.services.accounting_bridge_purchase_bill_service import (
    COGS_STOCK_LEDGER_EVENT_KEYS,
    _classify_stock_ledger_event,
)
from contracts.services.rent_lease_contract_service import (
    create_lease_contract,
    create_rent_contract,
)
from inventory.models import (
    HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN,
    RETURN_IN_MOVEMENT_TYPE_BY_PLAN,
    InventoryItem,
    StockLedger,
    StockLocation,
    StockMovementType,
)
from inventory.services.delivery_bridge_service import sync_delivery_inventory_bridge
from subscriptions.models import DeliveryStatus, Product
from tests.helpers import (
    create_admin_user,
    create_customer_profile,
    create_product,
)


class _StubDelivery:
    """Minimal stand-in so the bridge can be exercised per plan type without
    driving the whole scheduled -> dispatched -> delivered transition chain.

    ``moment`` must be a datetime: the bridge calls ``.date()`` on it.
    """

    def __init__(self, *, pk, subscription, status, moment):
        self.id = pk
        # audit logging reads .pk, the bridge reads .id
        self.pk = pk
        self.subscription = subscription
        self.status = status
        self.delivered_at = moment
        self.returned_at = moment
        self.updated_at = moment
        self.delivery_reference = f"TEST-DLV-{pk}"


class RentLeaseStockMovementTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="rl_stock_admin", phone="9381700099")
        self.customer = create_customer_profile(name="Rent Stock Customer", phone="7381700099")
        self.product = create_product(
            name="Rentable Bed",
            product_code="RL-STOCK-001",
            base_price=Decimal("21000.00"),
        )
        Product.objects.filter(pk=self.product.pk).update(
            is_rent_enabled=True,
            is_lease_enabled=True,
        )
        self.product.refresh_from_db()
        self.location = StockLocation.objects.create(code="RLMAIN", name="Rent Main Showroom")
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="RL-STOCK-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("0.000"),
            standard_unit_cost=Decimal("12000.00"),
        )
        StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
            movement_date=date(2026, 1, 1),
            stock_location=self.location,
            quantity_in=Decimal("3.000"),
            quantity_out=Decimal("0.000"),
            reference_model="OpeningStockEntry",
            reference_id="9001",
        )

    def _rent_sub(self):
        return create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def _lease_sub(self):
        return create_lease_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("25.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    # -- enum wiring ----------------------------------------------------

    def test_plan_maps_cover_all_three_plan_types(self):
        self.assertEqual(
            HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN["RENT"], StockMovementType.RENT_HANDOVER_OUT
        )
        self.assertEqual(
            HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN["LEASE"], StockMovementType.LEASE_HANDOVER_OUT
        )
        self.assertEqual(
            HANDOVER_OUT_MOVEMENT_TYPE_BY_PLAN["EMI"], StockMovementType.EMI_DELIVERY_OUT
        )
        self.assertEqual(
            RETURN_IN_MOVEMENT_TYPE_BY_PLAN["RENT"], StockMovementType.RENT_RETURN_IN
        )
        self.assertEqual(
            RETURN_IN_MOVEMENT_TYPE_BY_PLAN["LEASE"], StockMovementType.LEASE_RETURN_IN
        )

    # -- bridge writes the plan-correct movement -------------------------

    def test_rent_handover_writes_rent_movement_not_emi(self):
        subscription = self._rent_sub()
        delivery = _StubDelivery(
            pk=9101,
            subscription=subscription,
            status=DeliveryStatus.DELIVERED,
            moment=datetime(2026, 2, 1, tzinfo=dt_timezone.utc),
        )
        result = sync_delivery_inventory_bridge(delivery=delivery, performed_by=self.admin)
        row = StockLedger.objects.get(pk=result["stock_ledger_id"])
        self.assertEqual(row.movement_type, StockMovementType.RENT_HANDOVER_OUT)
        self.assertEqual(row.quantity_out, Decimal("1.000"))

    def test_lease_handover_writes_lease_movement(self):
        subscription = self._lease_sub()
        delivery = _StubDelivery(
            pk=9102,
            subscription=subscription,
            status=DeliveryStatus.DELIVERED,
            moment=datetime(2026, 2, 1, tzinfo=dt_timezone.utc),
        )
        result = sync_delivery_inventory_bridge(delivery=delivery, performed_by=self.admin)
        row = StockLedger.objects.get(pk=result["stock_ledger_id"])
        self.assertEqual(row.movement_type, StockMovementType.LEASE_HANDOVER_OUT)

    # -- physical stock still moves, and comes back on return ------------

    def test_rent_handover_reduces_stock_and_return_restores_it(self):
        opening = self.item.current_stock_quantity()
        subscription = self._rent_sub()

        out_delivery = _StubDelivery(
            pk=9103,
            subscription=subscription,
            status=DeliveryStatus.DELIVERED,
            moment=datetime(2026, 2, 1, tzinfo=dt_timezone.utc),
        )
        sync_delivery_inventory_bridge(delivery=out_delivery, performed_by=self.admin)
        self.item.refresh_from_db()
        after_handover = self.item.current_stock_quantity()
        self.assertEqual(after_handover, opening - Decimal("1.000"))

        in_delivery = _StubDelivery(
            pk=9104,
            subscription=subscription,
            status=DeliveryStatus.RETURNED,
            moment=datetime(2027, 2, 1, tzinfo=dt_timezone.utc),
        )
        result = sync_delivery_inventory_bridge(delivery=in_delivery, performed_by=self.admin)
        row = StockLedger.objects.get(pk=result["stock_ledger_id"])
        self.assertEqual(row.movement_type, StockMovementType.RENT_RETURN_IN)

        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), opening)

    # -- accounting: reclassification, never COGS ------------------------

    def test_rent_handover_is_not_classified_as_cogs(self):
        row = StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            movement_date=date(2026, 2, 1),
            stock_location=self.location,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            reference_model="SubscriptionDelivery",
            reference_id="9105",
        )
        event_key, _label, reason = _classify_stock_ledger_event(row)
        self.assertEqual(event_key, "rental_asset_handover_out")
        self.assertNotIn(event_key, COGS_STOCK_LEDGER_EVENT_KEYS)
        self.assertIsNone(reason)

    def test_rent_return_is_classified_as_asset_return(self):
        row = StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.RENT_RETURN_IN,
            movement_date=date(2027, 2, 1),
            stock_location=self.location,
            quantity_in=Decimal("1.000"),
            quantity_out=Decimal("0.000"),
            reference_model="SubscriptionDelivery",
            reference_id="9106",
        )
        event_key, _label, _reason = _classify_stock_ledger_event(row)
        self.assertEqual(event_key, "rental_asset_return_in")
        self.assertNotIn(event_key, COGS_STOCK_LEDGER_EVENT_KEYS)

    def test_lease_handover_is_not_classified_as_cogs(self):
        row = StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.LEASE_HANDOVER_OUT,
            movement_date=date(2026, 2, 1),
            stock_location=self.location,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            reference_model="SubscriptionDelivery",
            reference_id="9107",
        )
        event_key, _label, _reason = _classify_stock_ledger_event(row)
        self.assertEqual(event_key, "rental_asset_handover_out")
        self.assertNotIn(event_key, COGS_STOCK_LEDGER_EVENT_KEYS)
