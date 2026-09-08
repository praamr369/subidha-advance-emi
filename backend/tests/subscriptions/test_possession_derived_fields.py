"""Possession fields split into derived vs. observed.

Expected return date and serial number are computable from the contract and the
linked rental asset, so the system fills them. Condition notes describe what a
person saw when the goods changed hands, so they stay manual.

Before this, every rent/lease possession record was created with both derived
fields blank, which meant no contract had a known end date and nothing could
tell an operator that a return was due.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.test import TestCase

from deliveries.services.product_possession_service import (
    create_possession_record,
    derive_expected_return_date,
    record_handover,
    resolve_serial_number,
)
from deliveries.services.rental_asset_lifecycle_service import (
    create_rental_asset_from_inventory,
    reserve_asset_for_subscription,
)
from contracts.services.rent_lease_contract_service import create_rent_contract
from inventory.models import InventoryItem, StockLocation
from subscriptions.models import PossessionStatus, Product
from tests.helpers import create_admin_user, create_customer_profile, create_product


class PossessionDerivedFieldTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="possession_admin", phone="9381700077")
        self.customer = create_customer_profile(
            name="Possession Customer", phone="7381700077"
        )
        self.product = create_product(
            name="Possession Bed",
            product_code="POSS-001",
            base_price=Decimal("18000.00"),
        )
        Product.objects.filter(pk=self.product.pk).update(is_rent_enabled=True)
        self.product.refresh_from_db()
        self.location = StockLocation.objects.create(code="POSSLOC", name="Possession Store")
        self.item = InventoryItem.objects.create(
            product=self.product,
            sku="POSS-001",
            unit_of_measure="PCS",
            default_stock_location=self.location,
            standard_unit_cost=Decimal("9000.00"),
        )

    def _contract(self, *, start=date(2026, 9, 9), tenure=9):
        subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=tenure,
            start_date=start,
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
            save_as_draft=True,
        )
        return subscription

    # -- derived: expected return date -----------------------------------

    def test_expected_return_is_start_plus_tenure(self):
        subscription = self._contract(start=date(2026, 9, 9), tenure=9)
        self.assertEqual(
            derive_expected_return_date(subscription), date(2027, 6, 9)
        )

    def test_expected_return_handles_year_rollover(self):
        subscription = self._contract(start=date(2026, 11, 15), tenure=6)
        self.assertEqual(
            derive_expected_return_date(subscription), date(2027, 5, 15)
        )

    def test_possession_record_is_created_with_expected_return_filled(self):
        subscription = self._contract()
        possession = subscription.product_possession
        self.assertEqual(possession.expected_return_date, date(2027, 6, 9))

    def test_expected_return_is_none_without_a_tenure(self):
        subscription = self._contract()
        subscription.tenure_months = 0
        self.assertIsNone(derive_expected_return_date(subscription))

    # -- derived: serial number from the linked rental asset --------------

    def test_serial_number_resolves_from_linked_rental_asset(self):
        subscription = self._contract()
        asset = create_rental_asset_from_inventory(
            product=self.product,
            asset_code="RA-POSS-001",
            inventory_item=self.item,
            serial_no="SN-POSS-9",
            performed_by=self.admin,
        )
        reserve_asset_for_subscription(asset, subscription, performed_by=self.admin)
        self.assertEqual(resolve_serial_number(subscription), "SN-POSS-9")

    def test_handover_backfills_serial_linked_after_contract_creation(self):
        subscription = self._contract()
        possession = subscription.product_possession
        # No asset existed when the contract was created.
        self.assertEqual(possession.serial_number, "")

        asset = create_rental_asset_from_inventory(
            product=self.product,
            asset_code="RA-POSS-002",
            inventory_item=self.item,
            serial_no="SN-LATE-LINK",
            performed_by=self.admin,
        )
        reserve_asset_for_subscription(asset, subscription, performed_by=self.admin)

        possession = record_handover(
            possession=possession,
            handed_over_by=self.admin,
            handover_date=date(2026, 9, 9),
        )
        possession.refresh_from_db()
        self.assertEqual(possession.status, PossessionStatus.WITH_CUSTOMER)
        self.assertEqual(possession.serial_number, "SN-LATE-LINK")

    # -- observed: notes stay manual --------------------------------------

    def test_condition_notes_are_not_invented(self):
        """Notes record what a person saw; nothing should fabricate them."""
        subscription = self._contract()
        possession = record_handover(
            possession=subscription.product_possession,
            handed_over_by=self.admin,
            handover_date=date(2026, 9, 9),
        )
        self.assertEqual(possession.handover_condition_notes, "")
        self.assertEqual(possession.return_condition_notes, "")

    def test_handover_notes_are_stored_when_the_operator_gives_them(self):
        subscription = self._contract()
        possession = record_handover(
            possession=subscription.product_possession,
            handed_over_by=self.admin,
            handover_date=date(2026, 9, 9),
            handover_condition_notes="  Minor scratch on left leg  ",
        )
        self.assertEqual(possession.handover_condition_notes, "Minor scratch on left leg")
