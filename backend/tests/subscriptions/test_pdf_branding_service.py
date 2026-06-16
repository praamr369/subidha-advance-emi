import importlib.util
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from subscriptions.models import PlanType
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.services.contract_pdf_service import (
    generate_contract_pdf_for_subscription,
)
from subscriptions.services.pdf_branding_service import get_branding_context
from subscriptions.services.rent_lease_contract_service import create_rent_contract
from tests.helpers import create_admin_user, create_customer_profile, create_product


class PdfBrandingContextTests(TestCase):
    def test_branding_context_defaults_without_active_profile(self):
        BusinessProfile.objects.all().delete()
        branding = get_branding_context()
        self.assertEqual(branding.business_name, "Subidha Furniture")
        self.assertEqual(branding.tax_line, "")
        self.assertEqual(branding.watermark, "SUBIDHA")

    def test_branding_context_maps_pan_number_field_safely(self):
        # The model exposes ``pan_number`` (not ``pan``). Branding must map it
        # without raising AttributeError on the missing ``pan`` attribute.
        self.assertFalse(hasattr(BusinessProfile(), "pan"))
        BusinessProfile.objects.create(
            legal_name="Subidha Furniture Pvt Ltd",
            trade_name="Subidha Furniture",
            primary_phone="9000000001",
            primary_email="hello@example.com",
            gstin="29ABCDE1234F1Z5",
            pan_number="ABCDE1234F",
            is_active=True,
        )
        branding = get_branding_context()
        self.assertIn("PAN: ABCDE1234F", branding.tax_line)
        self.assertIn("GST: 29ABCDE1234F1Z5", branding.tax_line)
        self.assertEqual(branding.phone, "9000000001")
        self.assertEqual(branding.email, "hello@example.com")

    def test_branding_context_handles_missing_optional_branding_fields(self):
        # Only the required legal name is present; PAN/GST/phone/email blank.
        BusinessProfile.objects.create(
            legal_name="Minimal Business",
            is_active=True,
        )
        branding = get_branding_context()
        self.assertEqual(branding.business_name, "Minimal Business")
        self.assertEqual(branding.tax_line, "")
        self.assertEqual(branding.phone, "")
        self.assertEqual(branding.email, "")
        self.assertEqual(branding.watermark, "MINIMAL BUSINESS")


class RentContractPdfWithBrandingTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="branding_admin", phone="9000050001")
        self.customer = create_customer_profile(name="Branding Customer", phone="9000050002")
        self.rent_product = create_product(
            name="Branding Rent Product",
            product_code="BR-RENT-001",
            base_price=Decimal("24000.00"),
        )
        self.rent_product.is_rent_enabled = True
        self.rent_product.save(update_fields=["is_rent_enabled"])

    def _make_rent_subscription(self):
        return create_rent_contract(
            customer=self.customer,
            product=self.rent_product,
            tenure_months=6,
            start_date=timezone.localdate().replace(day=1),
            security_deposit_percent=Decimal("20.00"),
            performed_by=self.admin,
        )

    def test_rent_contract_pdf_generates_when_profile_has_no_pan_attribute(self):
        # Active profile with no PAN value set must not crash PDF generation.
        BusinessProfile.objects.create(
            legal_name="Subidha Furniture Pvt Ltd",
            trade_name="Subidha Furniture",
            is_active=True,
        )
        subscription = self._make_rent_subscription()
        if importlib.util.find_spec("reportlab") is None:
            self.skipTest("reportlab is not installed in this environment.")
        document = generate_contract_pdf_for_subscription(
            subscription=subscription,
            performed_by=self.admin,
        )
        self.assertEqual(subscription.plan_type, PlanType.RENT)
        self.assertTrue(document.file.name)

    def test_rent_contract_pdf_generates_with_full_branding(self):
        BusinessProfile.objects.create(
            legal_name="Subidha Furniture Pvt Ltd",
            trade_name="Subidha Furniture",
            primary_phone="9000000001",
            primary_email="hello@example.com",
            gstin="29ABCDE1234F1Z5",
            pan_number="ABCDE1234F",
            is_active=True,
        )
        subscription = self._make_rent_subscription()
        if importlib.util.find_spec("reportlab") is None:
            self.skipTest("reportlab is not installed in this environment.")
        document = generate_contract_pdf_for_subscription(
            subscription=subscription,
            performed_by=self.admin,
        )
        self.assertTrue(document.file.name)
        branding = get_branding_context()
        self.assertIn("PAN: ABCDE1234F", branding.tax_line)
