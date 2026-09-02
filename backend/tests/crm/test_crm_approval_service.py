from decimal import Decimal

from django.test import TestCase

from crm.models import OnlineRequest
from crm.services.crm_approval_service import create_direct_sale_from_enquiry
from crm.services.lead_conversion_service import LeadConversionService
from tests.helpers import (
    create_admin_user,
    create_product,
    ensure_test_accounting_posting_prerequisites,
)


class CreateDirectSaleFromEnquiryTests(TestCase):
    """
    create_direct_sale_from_enquiry backs POST /api/v1/crm-pipeline/pipeline/<pk>/approve/
    for DIRECT_SALE approvals. It previously wrote DirectSale fields that do not
    exist and omitted the required sale_date / financial_year / doc_series, so
    every such approval raised. It now goes through billing_service.create_direct_sale.
    """

    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="crm_approval_admin", phone="9364000993")
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.product = create_product(
            name="Approval Product",
            product_code="CRMAPP-001",
            base_price=Decimal("3000.00"),
        )
        self.customer, _ = LeadConversionService._find_or_create_customer(
            phone="7777777777",
            email="approval@example.com",
            name="Approval Customer",
            source="ADMIN",
        )

    def _make_online_request(self, **overrides):
        defaults = dict(
            request_number="ORQ-APPROVAL-0001",
            customer=self.customer,
            product=self.product,
            request_type="DIRECT_SALE",
            quantity=1,
            unit_price=Decimal("3000.00"),
            sub_total=Decimal("3000.00"),
            total_amount=Decimal("3000.00"),
            status="DRAFT",
        )
        defaults.update(overrides)
        return OnlineRequest.objects.create(**defaults)

    def test_creates_numbered_direct_sale_with_lines(self):
        online_request = self._make_online_request()

        sale = create_direct_sale_from_enquiry(online_request, created_by=self.admin)

        self.assertEqual(sale.customer, self.customer)
        self.assertTrue(sale.sale_no)
        self.assertIsNotNone(sale.doc_series_id)
        self.assertTrue(sale.financial_year)
        self.assertEqual(sale.grand_total, Decimal("3000.00"))
        self.assertEqual(sale.lines.count(), 1)
        self.assertEqual(sale.lines.first().product, self.product)
        self.assertTrue(sale.delivery_required)

    def test_falls_back_to_product_base_price_when_unit_price_missing(self):
        online_request = self._make_online_request(
            request_number="ORQ-APPROVAL-0002",
            unit_price=None,
        )

        sale = create_direct_sale_from_enquiry(online_request, created_by=self.admin)

        self.assertEqual(sale.lines.first().unit_price, Decimal("3000.00"))
