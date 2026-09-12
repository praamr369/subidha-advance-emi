"""Service-desk (return/exchange) case → customer resolution.

Cases carry no customer column; ``ServiceDeskCaseSerializer.customer_id`` resolves
it from the linked support request / sale / subscription / delivery / invoice so
the case page can show the customer's per-product money position.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from api.v1.serializers.service_desk import ServiceDeskCaseSerializer
from contracts.services.rent_lease_contract_service import create_rent_contract
from service_desk.models import ServiceDeskCase
from tests.helpers import create_admin_user, create_customer_profile, create_product


class ServiceCaseCustomerResolutionTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="case_customer_admin", phone="9104000001")
        self.customer = create_customer_profile(name="Case Rent Customer", phone="9104000002")
        product = create_product(
            name="Case Rent Sofa",
            product_code="CASE-RENT",
            base_price=Decimal("12000.00"),
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

    def test_service_case_linked_to_contract_resolves_its_customer(self):
        # SALES_RETURN/EXCHANGE must link an invoice or direct sale, so a
        # contract-only case is a SERVICE case.
        case = ServiceDeskCase.objects.create(
            case_type="SERVICE",
            subscription=self.subscription,
            issue_summary="Rent service inspection",
        )

        data = ServiceDeskCaseSerializer(case).data

        self.assertEqual(data["customer_id"], self.customer.id)

    def test_case_without_links_has_no_customer(self):
        case = ServiceDeskCase.objects.create(
            case_type="COMPLAINT",
            issue_summary="Walk-in complaint",
        )

        data = ServiceDeskCaseSerializer(case).data

        self.assertIsNone(data["customer_id"])
