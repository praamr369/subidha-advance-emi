"""Completing a repossession brings the unit back like a return.

It used to change only the case status: the delivery stayed DELIVERED, stock
never came back, and the rental asset still showed HANDED_OVER — so a
repossessed unit could never be released.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from contracts.services.rent_lease_contract_service import create_rent_contract
from deliveries.models import Repossession
from deliveries.services.return_inspection_service import returned_asset_id_for_subscription
from inventory.models import InventoryItem, StockLedger, StockLocation, StockMovementType
from subscriptions.models import (
    Product,
    RentalAsset,
    RentalAssetStatus,
    Subscription,
    SubscriptionStatus,
)
from tests.helpers import create_admin_user, create_customer_profile, create_product


class RepossessionCompletionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="reposs_admin", phone="9106000001")
        self.client.force_authenticate(user=self.admin)
        self.customer = create_customer_profile(name="Repossession Customer", phone="9106000002")
        product = create_product(
            name="Repossession Wardrobe",
            product_code="REPOSS-RENT",
            base_price=Decimal("12000.00"),
        )
        Product.objects.filter(pk=product.pk).update(is_rent_enabled=True)
        product.refresh_from_db()
        location = StockLocation.objects.create(code="REPOSS", name="Repossession Store")
        self.item = InventoryItem.objects.create(
            product=product,
            sku="REPOSS-RENT",
            unit_of_measure="PCS",
            default_stock_location=location,
            opening_stock_qty=Decimal("0.000"),
            standard_unit_cost=Decimal("9000.00"),
        )
        StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.OPENING_BALANCE_IN,
            movement_date=date(2026, 6, 1),
            stock_location=location,
            quantity_in=Decimal("1.000"),
            quantity_out=Decimal("0.000"),
            reference_model="OpeningStockEntry",
            reference_id="REPOSS-1",
        )
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )
        # Handed over without a delivery record: one unit out on hire.
        StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.RENT_HANDOVER_OUT,
            movement_date=date(2026, 6, 2),
            stock_location=location,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("1.000"),
            reference_model="SubscriptionDelivery",
            reference_id="REPOSS-HANDOVER",
        )
        Subscription.objects.filter(pk=self.subscription.pk).update(status=SubscriptionStatus.HANDED_OVER)
        self.subscription.refresh_from_db()
        self.asset = RentalAsset.objects.create(
            product=product,
            inventory_item=self.item,
            asset_code="RA-REPOSS-001",
            serial_no="SN-REPOSS-1",
            purchase_cost=Decimal("9000.00"),
            status=RentalAssetStatus.HANDED_OVER,
            current_subscription=self.subscription,
            current_customer=self.customer,
        )
        now = timezone.now()
        self.repossession = Repossession.objects.create(
            subscription=self.subscription,
            status="IN_PROGRESS",
            notice_issued_at=now - timedelta(days=30),
            notice_issued_by=self.admin,
            response_deadline=timezone.localdate() - timedelta(days=5),
            initiated_at=now - timedelta(days=2),
            initiated_by=self.admin,
        )

    def _act(self, action, **data):
        return self.client.post(
            f"/api/v1/admin/repossessions/{self.repossession.pk}/{action}/", data, format="json"
        )

    def _return_ins(self):
        return StockLedger.objects.filter(
            inventory_item=self.item, movement_type=StockMovementType.RENT_RETURN_IN
        )

    def test_completion_brings_the_unit_back_into_stock_and_the_rental_pool(self):
        response = self._act("complete")

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        self.assertEqual(response.data["status"], "COMPLETED")
        return_in = self._return_ins().get()
        self.assertEqual(return_in.quantity_in, Decimal("1.000"))
        self.assertEqual(return_in.reference_model, "Repossession")
        self.assertEqual(return_in.reference_id, str(self.repossession.pk))
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock_quantity(), Decimal("1.000"))
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.RETURNED)
        self.assertIsNone(self.asset.current_subscription_id)
        # The release buttons find the unit through the contract it came back from.
        self.assertEqual(returned_asset_id_for_subscription(self.subscription.pk), self.asset.pk)

    def test_completing_again_posts_nothing_new(self):
        self._act("complete")

        response = self._act("complete")

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        self.assertEqual(self._return_ins().count(), 1)

    def test_cancelling_leaves_the_unit_with_the_customer(self):
        response = self._act("cancel", cancellation_reason="Customer paid the arrears.")

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=str(response.data))
        self.assertFalse(self._return_ins().exists())
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, RentalAssetStatus.HANDED_OVER)
