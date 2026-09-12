"""Warranty claim rows carry the customer id.

The warranty claims list and the service-schedule board show a lazy
"customer position" toggle per card, which needs ``customer_id`` on each row.
A claim reaches its customer via its contract, or — when it has none — via the
service-desk case every claim hangs off.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from api.v1.views.admin_warranty import _warranty_claim_row
from api.v1.views.admin_warranty_schedule import _schedule_row
from contracts.services.rent_lease_contract_service import create_rent_contract
from service_desk.models import ServiceDeskCase, WarrantyClaim
from tests.helpers import create_admin_user, create_customer_profile, create_product


class WarrantyRowCustomerTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="warranty_row_admin", phone="9105000001")
        self.customer = create_customer_profile(name="Warranty Rent Customer", phone="9105000002")
        self.product = create_product(
            name="Warranty Rent Recliner",
            product_code="WARRANTY-RENT",
            base_price=Decimal("12000.00"),
        )
        self.product.is_rent_enabled = True
        self.product.save(update_fields=["is_rent_enabled"])
        self.subscription = create_rent_contract(
            customer=self.customer,
            product=self.product,
            tenure_months=6,
            start_date=date(2026, 6, 1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def _claim(self, *, subscription=None, case_subscription=None):
        case = ServiceDeskCase.objects.create(
            case_type="SERVICE",
            subscription=case_subscription,
            issue_summary="Recliner mechanism jammed",
        )
        today = date(2026, 9, 1)
        return WarrantyClaim.objects.create(
            service_case=case,
            product=self.product,
            subscription=subscription,
            warranty_start_date=today - timedelta(days=90),
            warranty_end_date=today + timedelta(days=275),
            defect_description="Mechanism jammed",
            defect_date_discovered=today,
        )

    def test_claim_with_contract_resolves_customer(self):
        claim = self._claim(subscription=self.subscription)

        self.assertEqual(_warranty_claim_row(claim)["customer_id"], self.customer.id)
        self.assertEqual(_schedule_row(claim)["customer_id"], self.customer.id)

    def test_claim_without_contract_falls_back_to_service_case(self):
        claim = self._claim(subscription=None, case_subscription=self.subscription)

        self.assertEqual(_warranty_claim_row(claim)["customer_id"], self.customer.id)
        self.assertEqual(_schedule_row(claim)["customer_id"], self.customer.id)

    def test_claim_with_no_customer_link_has_none(self):
        claim = self._claim(subscription=None, case_subscription=None)

        self.assertIsNone(_warranty_claim_row(claim)["customer_id"])
        self.assertIsNone(_schedule_row(claim)["customer_id"])
