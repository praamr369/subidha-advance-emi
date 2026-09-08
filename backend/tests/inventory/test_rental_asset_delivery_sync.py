"""The rental asset and the stock ledger must tell the same story.

Both records describe one physical unit. Before this sync, only the ledger moved
automatically: a delivery marked RETURNED restocked inventory while its rental
asset stayed HANDED_OVER forever, so the same bed was simultaneously "back in
the showroom" and "with the customer".

Also pins the accounting side: RENTAL_ASSET_IN_SERVICE is a real, mapped ASSET
account, so rent handover journals post as a reclassification instead of
warning about a missing mapping.
"""
from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccountType, FinanceAccountMappingPurpose
from accounting.services.accounting_setup_catalog import SYSTEM_POSTING_PROFILE_ACCOUNTS
from contracts.services.rent_lease_contract_service import create_rent_contract
from deliveries.services.rental_asset_lifecycle_service import (
    create_rental_asset_from_inventory,
    mark_asset_handed_over,
    reserve_asset_for_subscription,
    sync_delivery_rental_asset,
)
from inventory.models import InventoryItem, StockLocation
from subscriptions.models import DeliveryStatus, Product, RentalAsset, RentalAssetStatus
from tests.helpers import create_admin_user, create_customer_profile, create_product


class _StubDelivery:
    """Stand-in for a SubscriptionDelivery at a given status."""

    def __init__(self, *, pk, subscription, status):
        self.id = pk
        self.pk = pk
        self.subscription = subscription
        self.status = status
        moment = datetime(2026, 2, 1, tzinfo=dt_timezone.utc)
        self.delivered_at = moment
        self.returned_at = moment
        self.updated_at = moment
        self.delivery_reference = f"TEST-DLV-{pk}"


class RentalAssetDeliverySyncTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="asset_sync_admin", phone="9381700055")
        self.customer = create_customer_profile(name="Asset Sync Customer", phone="7381700055")
        self.product = create_product(
            name="Sync Bed", product_code="SYNC-001", base_price=Decimal("20000.00")
        )
        Product.objects.filter(pk=self.product.pk).update(is_rent_enabled=True)
        self.product.refresh_from_db()
        self.location = StockLocation.objects.create(code="SYNCLOC", name="Sync Store")
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="SYNC-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("11000.00"),
        )
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=12,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )

    def _asset(self, code="RA-SYNC-001"):
        return create_rental_asset_from_inventory(
            product=self.product,
            asset_code=code,
            inventory_item=self.item,
            serial_no=f"SN-{code}",
            performed_by=self.admin,
        )

    # -- delivery drives the asset ---------------------------------------

    def test_delivered_marks_reserved_asset_handed_over(self):
        asset = self._asset()
        reserve_asset_for_subscription(asset, self.subscription, performed_by=self.admin)

        result = sync_delivery_rental_asset(
            delivery=_StubDelivery(
                pk=1, subscription=self.subscription, status=DeliveryStatus.DELIVERED
            ),
            performed_by=self.admin,
        )
        asset.refresh_from_db()
        self.assertTrue(result["changed"])
        self.assertEqual(asset.status, RentalAssetStatus.HANDED_OVER)

    def test_returned_marks_handed_over_asset_returned(self):
        asset = self._asset()
        reserve_asset_for_subscription(asset, self.subscription, performed_by=self.admin)
        mark_asset_handed_over(asset, self.subscription, performed_by=self.admin)

        result = sync_delivery_rental_asset(
            delivery=_StubDelivery(
                pk=2, subscription=self.subscription, status=DeliveryStatus.RETURNED
            ),
            performed_by=self.admin,
        )
        asset.refresh_from_db()
        self.assertTrue(result["changed"])
        self.assertEqual(asset.status, RentalAssetStatus.RETURNED)
        self.assertIsNone(asset.current_subscription_id)

    def test_sync_is_idempotent(self):
        asset = self._asset()
        reserve_asset_for_subscription(asset, self.subscription, performed_by=self.admin)
        delivery = _StubDelivery(
            pk=3, subscription=self.subscription, status=DeliveryStatus.DELIVERED
        )
        sync_delivery_rental_asset(delivery=delivery, performed_by=self.admin)
        second = sync_delivery_rental_asset(delivery=delivery, performed_by=self.admin)
        self.assertFalse(second["changed"])
        self.assertEqual(second["reason"], "already_handed_over")

    # -- forgiving in every degenerate case -------------------------------

    def test_no_linked_asset_is_not_an_error(self):
        result = sync_delivery_rental_asset(
            delivery=_StubDelivery(
                pk=4, subscription=self.subscription, status=DeliveryStatus.DELIVERED
            ),
            performed_by=self.admin,
        )
        self.assertFalse(result["changed"])
        self.assertEqual(result["reason"], "no_linked_asset")

    def test_intermediate_delivery_status_touches_nothing(self):
        asset = self._asset()
        reserve_asset_for_subscription(asset, self.subscription, performed_by=self.admin)
        result = sync_delivery_rental_asset(
            delivery=_StubDelivery(
                pk=5, subscription=self.subscription, status=DeliveryStatus.DISPATCHED
            ),
            performed_by=self.admin,
        )
        asset.refresh_from_db()
        self.assertFalse(result["changed"])
        self.assertEqual(asset.status, RentalAssetStatus.RESERVED)

    def test_linked_but_unreserved_asset_is_reserved_then_handed_over(self):
        """A link made outside the reserve flow must not dead-end the handover."""
        asset = self._asset()
        RentalAsset.objects.filter(pk=asset.pk).update(
            current_subscription=self.subscription,
            current_customer=self.customer,
            status=RentalAssetStatus.AVAILABLE,
        )
        result = sync_delivery_rental_asset(
            delivery=_StubDelivery(
                pk=6, subscription=self.subscription, status=DeliveryStatus.DELIVERED
            ),
            performed_by=self.admin,
        )
        asset.refresh_from_db()
        self.assertTrue(result["changed"])
        self.assertEqual(asset.status, RentalAssetStatus.HANDED_OVER)


class RentalAssetAccountMappingTests(TestCase):
    """The account the rent handover journal credits/debits must actually exist."""

    def test_purpose_is_registered_as_an_asset_account(self):
        specs = {spec.key: spec for spec in SYSTEM_POSTING_PROFILE_ACCOUNTS}
        self.assertIn("RENTAL_ASSET_IN_SERVICE", specs)
        self.assertEqual(
            specs["RENTAL_ASSET_IN_SERVICE"].account_type, ChartOfAccountType.ASSET
        )

    def test_purpose_enum_exists(self):
        self.assertEqual(
            FinanceAccountMappingPurpose.RENTAL_ASSET_IN_SERVICE, "RENTAL_ASSET_IN_SERVICE"
        )

    def test_bridge_readiness_declares_both_rental_events(self):
        from accounting.services.accounting_bridge_readiness_service import (
            EVENT_REGISTRY,
        )

        keys = {spec.event_key for spec in EVENT_REGISTRY}
        self.assertIn("rental_asset_handover_out", keys)
        self.assertIn("rental_asset_return_in", keys)
