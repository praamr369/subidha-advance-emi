"""Journal voucher → party resolution.

Journal entries carry only ``source_model`` + ``source_id``; the voucher page
shows the customer/vendor money position by resolving the party from the
source record. The resolver only reads those two attributes, so a namespace
stands in for the journal entry while the source record is real.
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.test import TestCase

from accounting.models import Vendor
from accounting.services.journal_party_service import resolve_journal_party
from contracts.services.rent_lease_contract_service import create_rent_contract
from tests.helpers import create_admin_user, create_customer_profile, create_product


class JournalPartyResolutionTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="journal_party_admin", phone="9108000001")
        self.customer = create_customer_profile(name="Journal Party Customer", phone="9108000002")
        product = create_product(
            name="Journal Party Sofa", product_code="JOURNAL-PARTY", base_price=Decimal("12000.00")
        )
        product.is_rent_enabled = True
        product.save(update_fields=["is_rent_enabled"])
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_contract_source_resolves_customer(self):
        entry = SimpleNamespace(source_model="Subscription", source_id=str(self.subscription.id))

        party = resolve_journal_party(entry)

        self.assertEqual(party["customer_id"], self.customer.id)
        self.assertIsNone(party["vendor_id"])

    def test_vendor_source_resolves_vendor(self):
        vendor = Vendor.objects.create(name="Journal Party Timber")
        entry = SimpleNamespace(source_model="Vendor", source_id=str(vendor.id))

        party = resolve_journal_party(entry)

        self.assertEqual(party["vendor_id"], vendor.id)
        self.assertIsNone(party["customer_id"])

    def test_partyless_or_malformed_sources_resolve_nothing(self):
        for entry in (
            SimpleNamespace(source_model="OpeningStockEntry", source_id="1"),
            SimpleNamespace(source_model="Subscription", source_id="not-a-number"),
            SimpleNamespace(source_model="", source_id=""),
            SimpleNamespace(source_model="Subscription", source_id="999999"),
        ):
            party = resolve_journal_party(entry)
            self.assertIsNone(party["customer_id"], msg=str(entry))
            self.assertIsNone(party["vendor_id"], msg=str(entry))
