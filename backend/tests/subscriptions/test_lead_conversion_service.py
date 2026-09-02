from decimal import Decimal

from django.test import TestCase

from crm.services.lead_conversion_service import (
    LeadConversionError,
    LeadConversionService,
)
from tests.helpers import (
    create_admin_user,
    create_product,
    ensure_test_accounting_posting_prerequisites,
)


class LeadConversionServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="lead_conv_admin", phone="9364000992")
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.product = create_product(
            name="Test Product",
            product_code="LEADCONV-001",
            base_price=Decimal("1000.00"),
        )
        self.sale_product = create_product(
            name="Sale Product",
            product_code="LEADCONV-002",
            base_price=Decimal("2000.00"),
        )

    def test_find_or_create_customer(self):
        customer, created = LeadConversionService._find_or_create_customer(
            phone="1234567890",
            email="test@example.com",
            name="Test User",
            source="ONLINE"
        )
        self.assertTrue(created)
        self.assertEqual(customer.name, "Test User")
        self.assertEqual(customer.phone, "1234567890")
        self.assertEqual(customer.customer_source, "ONLINE")

        customer2, created2 = LeadConversionService._find_or_create_customer(
            phone="1234567890",
            email="test2@example.com",
            name="Test User 2",
            source="ONLINE"
        )
        self.assertFalse(created2)
        self.assertEqual(customer.id, customer2.id)

    def test_process_online_enquiry(self):
        online_req, customer, lead, created_customer = LeadConversionService.process_online_enquiry(
            phone="9876543210",
            email="online@example.com",
            name="Online User",
            product_name="Test Product",
            amount="1000.00"
        )

        self.assertTrue(created_customer)
        self.assertEqual(customer.phone, "9876543210")
        self.assertEqual(online_req.customer, customer)
        self.assertEqual(online_req.product, self.product)
        self.assertEqual(online_req.total_amount, Decimal("1000.00"))
        self.assertEqual(online_req.status, "DRAFT")
        self.assertEqual(lead.converted_customer, customer)
        self.assertEqual(lead.converted_online_request, online_req)
        self.assertEqual(lead.phone, "9876543210")
        self.assertEqual(lead.status, "CONTACTED")

        online_req2, customer2, lead2, created_customer2 = LeadConversionService.process_online_enquiry(
            phone="9876543210",
            email="online2@example.com",
            name="Online User Changed",
            product_name="Test Product",
        )
        self.assertFalse(created_customer2)
        self.assertEqual(customer2.id, customer.id)
        self.assertEqual(lead2.id, lead.id)
        self.assertEqual(lead2.converted_online_request, online_req2)
        # Price falls back to the product master when no amount is supplied.
        self.assertEqual(online_req2.total_amount, Decimal("1000.00"))

    def test_process_online_enquiry_rejects_unknown_product(self):
        with self.assertRaises(LeadConversionError):
            LeadConversionService.process_online_enquiry(
                phone="9876500000",
                email="nomatch@example.com",
                name="No Match",
                product_name="Nonexistent Product",
            )

    def test_process_direct_sale_raises_a_request_and_books_nothing(self):
        """
        A numbered DirectSale is a real accounting document. Raising it straight
        from a lead screen skipped the approval gate every other route respects,
        so this now only creates a request.
        """
        from billing.models import DirectSale

        request_obj, customer, lead, created_customer = LeadConversionService.process_direct_sale(
            phone="5555555555",
            email="sale@example.com",
            name="Sale User",
            product_name="Sale Product",
            amount="2000.00",
            created_by=self.admin,
        )

        self.assertTrue(created_customer)
        self.assertEqual(customer.phone, "5555555555")
        self.assertEqual(request_obj.customer, customer)
        self.assertEqual(request_obj.request_type, "DIRECT_SALE")
        self.assertEqual(request_obj.status, "DRAFT")
        self.assertEqual(request_obj.total_amount, Decimal("2000.00"))
        self.assertEqual(request_obj.product, self.sale_product)

        # Nothing booked, and no sale number consumed.
        self.assertEqual(DirectSale.objects.count(), 0)

        self.assertEqual(lead.converted_customer, customer)
        self.assertEqual(lead.converted_online_request, request_obj)
        self.assertEqual(lead.phone, "5555555555")
        self.assertNotEqual(lead.status, "CONVERTED")

    def test_approving_the_request_is_what_issues_the_sale_document(self):
        from billing.models import DirectSale
        from crm.services.crm_approval_service import approve_online_request

        request_obj, customer, _lead, _created = LeadConversionService.process_direct_sale(
            phone="5555555556",
            email="sale2@example.com",
            name="Sale User Two",
            product_name="Sale Product",
            amount="2000.00",
            created_by=self.admin,
        )
        self.assertEqual(DirectSale.objects.count(), 0)

        sale = approve_online_request(
            request_obj, approval_type="DIRECT_SALE", approval_user=self.admin
        )

        self.assertEqual(DirectSale.objects.count(), 1)
        self.assertEqual(sale.customer, customer)
        self.assertTrue(sale.sale_no)
        self.assertIsNotNone(sale.doc_series_id)
        self.assertEqual(sale.lines.count(), 1)
        self.assertEqual(sale.lines.first().product, self.sale_product)

    def test_process_product_request_creates_request_against_real_product(self):
        customer, _ = LeadConversionService._find_or_create_customer(
            phone="4444444444",
            email="preq@example.com",
            name="Product Request User",
            source="ADMIN",
        )

        product_request, lead = LeadConversionService.process_product_request(
            customer_id=customer.id,
            requester=self.admin,
            product_name="Test Product",
        )

        self.assertEqual(product_request.customer, customer)
        self.assertEqual(product_request.product, self.product)
        self.assertEqual(product_request.request_type, "DIRECT_SALE")
        self.assertEqual(product_request.status, "SUBMITTED")
        self.assertEqual(product_request.requester, self.admin)

    def test_process_product_request_rejects_unknown_customer(self):
        with self.assertRaises(LeadConversionError):
            LeadConversionService.process_product_request(
                customer_id=999999,
                requester=self.admin,
                product_name="Test Product",
            )
