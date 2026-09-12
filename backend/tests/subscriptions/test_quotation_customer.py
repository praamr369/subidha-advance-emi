"""Brochure quotation → existing customer resolution.

Quotations carry no customer column (a quotation is usually for a prospect).
``BrochureQuotationAdminSerializer.customer_id`` resolves one only through
explicit links — a converted CRM lead or a CRM party that is a customer — never
by phone matching, so the admin panel can show that customer's per-product
money position.
"""
from django.test import TestCase

from brochures.models import BrochureQuotation
from brochures.serializers import BrochureQuotationAdminSerializer
from crm.models import Lead, LeadSource
from tests.helpers import create_admin_user, create_customer_profile


class QuotationCustomerResolutionTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="quotation_customer_admin", phone="9106000001")
        self.customer = create_customer_profile(name="Quotation Existing Customer", phone="9106000002")

    def _quotation(self, *, no: str, crm_lead_id=None, crm_party_id=None):
        return BrochureQuotation.objects.create(
            quotation_no=no,
            customer_name="Quotation Existing Customer",
            phone="9106000002",
            quotation_type="DIRECT_SALE",
            public_token=f"token-{no}",
            created_by=self.admin,
            crm_lead_id=crm_lead_id,
            crm_party_id=crm_party_id,
        )

    def test_quotation_for_converted_lead_resolves_customer(self):
        lead = Lead.objects.create(
            name="Quotation Existing Customer",
            phone="9106000002",
            source=LeadSource.choices[0][0],
            converted_customer=self.customer,
        )
        quotation = self._quotation(no="QTN-TEST-0001", crm_lead_id=lead.id)

        data = BrochureQuotationAdminSerializer(quotation).data

        self.assertEqual(data["customer_id"], self.customer.id)

    def test_unconverted_lead_or_no_links_has_no_customer(self):
        lead = Lead.objects.create(
            name="New Prospect",
            phone="9106000003",
            source=LeadSource.choices[0][0],
        )
        from_unconverted_lead = self._quotation(no="QTN-TEST-0002", crm_lead_id=lead.id)
        unlinked = self._quotation(no="QTN-TEST-0003")

        self.assertIsNone(BrochureQuotationAdminSerializer(from_unconverted_lead).data["customer_id"])
        self.assertIsNone(BrochureQuotationAdminSerializer(unlinked).data["customer_id"])
