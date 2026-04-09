from datetime import date
from decimal import Decimal

from django.test import TestCase

from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from inventory.services.delivery_bridge_service import sync_delivery_inventory_bridge
from subscriptions.models import DeliveryStatus
from subscriptions.services.delivery_service import (
    create_subscription_delivery,
    mark_subscription_delivery_delivered,
    mark_subscription_delivery_returned,
    request_subscription_delivery_return,
    transition_subscription_delivery_status,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DeliveryInventoryBridgeTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="delivery_inventory_admin",
            phone="9381700002",
        )
        self.customer = create_customer_profile(
            name="Delivery Inventory Customer",
            phone="7381700002",
        )
        self.product = create_product(
            name="Delivery Inventory Product",
            product_code="DLV-INV-001",
            base_price=Decimal("9000.00"),
        )
        self.location = StockLocation.objects.create(
            code="SHOWROOM",
            name="Main Showroom",
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="DLV-INV-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("5.000"),
        )
        self.batch = create_batch(
            batch_code="DLVINV2026",
            duration_months=9,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=31)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("9000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=9,
        )

    def test_delivery_mark_delivered_creates_single_stock_issue(self):
        delivery = create_subscription_delivery(
            subscription=self.subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 4, 10),
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.DISPATCHED,
            performed_by=self.admin,
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.OUT_FOR_DELIVERY,
            performed_by=self.admin,
        )

        mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=self.admin,
            receiver_name="Receiver",
            receiver_phone="7381700002",
            notes="Delivered to customer",
        )
        duplicate = sync_delivery_inventory_bridge(delivery=delivery, performed_by=self.admin)

        entries = StockLedger.objects.filter(
            inventory_item=self.inventory_item,
            movement_type=StockMovementType.EMI_DELIVERY_OUT,
            reference_model="SubscriptionDelivery",
            reference_id=str(delivery.id),
        )

        self.assertEqual(entries.count(), 1)
        self.assertFalse(duplicate["created"])
        self.assertEqual(entries.first().stock_location_id, self.location.id)

    def test_delivery_return_creates_return_stock_movement(self):
        delivery = create_subscription_delivery(
            subscription=self.subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 4, 11),
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.DISPATCHED,
            performed_by=self.admin,
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.OUT_FOR_DELIVERY,
            performed_by=self.admin,
        )
        mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=self.admin,
            receiver_name="Receiver",
            receiver_phone="7381700002",
            notes="Delivered",
        )
        request_subscription_delivery_return(
            delivery=delivery,
            performed_by=self.admin,
            notes="Customer requested return",
        )
        mark_subscription_delivery_returned(
            delivery=delivery,
            performed_by=self.admin,
            notes="Returned to store",
        )

        entries = StockLedger.objects.filter(
            inventory_item=self.inventory_item,
            reference_model="SubscriptionDelivery",
            reference_id=str(delivery.id),
        )

        self.assertTrue(
            entries.filter(movement_type=StockMovementType.EMI_DELIVERY_OUT).exists()
        )
        self.assertTrue(
            entries.filter(movement_type=StockMovementType.EMI_RETURN_IN).exists()
        )

    def test_delivery_bridge_can_be_disabled_per_inventory_item(self):
        self.inventory_item.delivery_stock_bridge_enabled = False
        self.inventory_item.save(update_fields=["delivery_stock_bridge_enabled", "updated_at"])

        delivery = create_subscription_delivery(
            subscription=self.subscription,
            performed_by=self.admin,
            status=DeliveryStatus.SCHEDULED,
            scheduled_date=date(2026, 4, 12),
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.DISPATCHED,
            performed_by=self.admin,
        )
        delivery = transition_subscription_delivery_status(
            delivery=delivery,
            next_status=DeliveryStatus.OUT_FOR_DELIVERY,
            performed_by=self.admin,
        )

        mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=self.admin,
            receiver_name="Receiver",
            receiver_phone="7381700002",
            notes="Delivered without stock bridge",
        )
        result = sync_delivery_inventory_bridge(delivery=delivery, performed_by=self.admin)

        self.assertEqual(result["reason"], "delivery_bridge_disabled")
        self.assertFalse(
            StockLedger.objects.filter(
                inventory_item=self.inventory_item,
                reference_model="SubscriptionDelivery",
                reference_id=str(delivery.id),
            ).exists()
        )
