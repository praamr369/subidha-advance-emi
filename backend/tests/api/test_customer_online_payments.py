from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from business_setup.models.payment_gateway import PaymentGatewayEnvironment, PaymentGatewaySettings
from customers.models import Customer
from payments.models_online_gateway import OnlineGatewayStatus, OnlineGatewayTransaction

User = get_user_model()


class CustomerOnlinePaymentsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="cust_user", phone="9876543210", password="password123", role="CUSTOMER")
        self.customer = Customer.objects.create(user=self.user, name="Cust User", phone="9876543210")
        self.client.force_authenticate(user=self.user)

    def test_report_direct_upi_success(self):
        url = "/api/v1/customer/payments/report-direct-upi/"
        payload = {
            "amount": "1500.00",
            "utr_number": "431289123456",
            "source_type": "EMI",
            "source_id": 10,
            "payer_upi_id": "cust@upi",
            "notes": "Paid from GPay",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["utr_number"], "431289123456")

        tx = OnlineGatewayTransaction.objects.get(merchant_transaction_id=res.data["transaction_id"])
        self.assertEqual(tx.gateway_type, "DIRECT_UPI")
        self.assertEqual(tx.status, OnlineGatewayStatus.PENDING)
        self.assertEqual(tx.provider_reference_id, "431289123456")
        self.assertEqual(tx.amount, Decimal("1500.00"))
        self.assertEqual(tx.customer, self.customer)

    def test_report_direct_upi_requires_utr(self):
        url = "/api/v1/customer/payments/report-direct-upi/"
        payload = {
            "amount": "1500.00",
            "utr_number": "",
            "source_type": "EMI",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("required", str(res.data.get("error", "")).lower())

    def test_initiate_online_fails_when_gateway_disabled(self):
        PaymentGatewaySettings.objects.all().delete()
        url = "/api/v1/customer/payments/online/initiate/"
        payload = {
            "amount": "1500.00",
            "source_type": "EMI",
            "source_id": 10,
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("disabled", str(res.data.get("error", "")).lower())

    def test_public_business_profile_returns_gateway_status(self):
        url = "/api/v1/public/business-profile/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertIn("profile", res.data)
        prof = res.data["profile"]
        self.assertIsNotNone(prof)
        self.assertIn("upi_id", prof)
        self.assertIn("is_gateway_enabled", prof)
        self.assertFalse(prof["is_gateway_enabled"])
