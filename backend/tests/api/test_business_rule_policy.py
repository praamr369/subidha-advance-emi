from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import BusinessTaxProfile
from subscriptions.models_business_setup import BusinessRulePolicy
from tests.helpers import create_admin_user, create_customer_user


class BusinessRulePolicyApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="legal_controls_admin", phone="9198100101")
        self.customer = create_customer_user(username="legal_controls_customer", phone="9198100102")

    def test_legal_controls_are_admin_only_and_default_to_safe_blockers(self):
        self.client.force_authenticate(self.customer)
        denied = self.client.get("/api/v1/admin/settings/legal-controls/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/settings/legal-controls/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["policy"]["plan_type"], "PRODUCT_INSTALLMENT")
        self.assertEqual(response.data["policy"]["benefit_type"], "CONTRACTUAL_WAIVER")
        self.assertEqual(response.data["policy"]["selection_method"], "HASH_FAIRNESS")
        self.assertEqual(response.data["policy"]["funding_source"], "COMPANY_MARGIN")
        self.assertEqual(response.data["policy"]["refund_sla_working_days"], 7)
        self.assertTrue(response.data["policy"]["partner_receipt_admin_approval_required"])
        self.assertTrue(response.data["policy"]["kyc_masking_required"])
        self.assertTrue(response.data["policy"]["deposit_refund_requires_inspection"])
        self.assertEqual(response.data["derived"]["invoice_mode"], "NON_GST_BILL")
        self.assertFalse(response.data["derived"]["tax_invoice_enabled"])
        self.assertTrue(response.data["derived"]["waiver_public_launch_blocked"])
        self.assertIn("Retail Bill", response.data["derived"]["document_labels"])
        self.assertEqual(BusinessTaxProfile.objects.filter(is_active=True).count(), 1)

    def test_policy_rejects_customer_pool_and_bad_late_charge_wording(self):
        with self.assertRaises(ValidationError):
            BusinessRulePolicy(funding_source="CUSTOMER_POOL_BLOCKED").full_clean()

        with self.assertRaises(ValidationError):
            BusinessRulePolicy(late_payment_charge_label="Penalty").full_clean()

    def test_patch_updates_launch_controls_without_enabling_unsafe_defaults(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            "/api/v1/admin/settings/legal-controls/",
            {
                "risk_status": "APPROVED_FOR_INTERNAL_TEST",
                "refund_sla_working_days": 7,
                "late_payment_charge_configured": True,
                "late_payment_charge_enabled": True,
                "late_payment_charge_label": "Late Payment Charge",
                "notes": "Internal testing only.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["policy"]["risk_status"], "APPROVED_FOR_INTERNAL_TEST")
        self.assertTrue(response.data["policy"]["late_payment_charge_enabled"])
        self.assertTrue(response.data["derived"]["late_payment_charge_application_enabled"])
        self.assertTrue(response.data["derived"]["waiver_public_launch_blocked"])
        self.assertFalse(response.data["derived"]["tax_invoice_enabled"])
