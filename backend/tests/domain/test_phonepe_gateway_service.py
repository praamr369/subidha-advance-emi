from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model

from business_setup.models.payment_gateway import (
    PaymentGatewayEnvironment,
    PaymentGatewaySettings,
)
from payments.models_online_gateway import (
    OnlineGatewayPaymentType,
    OnlineGatewayStatus,
    OnlineGatewayTransaction,
)
from payments.services.phonepe_gateway_service import (
    PhonePeGatewayService,
    compute_sha256_checksum,
    verify_phonepe_checksum,
)


class PhonePeGatewayServiceTests(TestCase):
    def setUp(self):
        self.settings = PaymentGatewaySettings(
            merchant_id="TESTMID123",
            salt_index=1,
            environment=PaymentGatewayEnvironment.UAT,
            is_enabled=True,
            autopay_enabled=True,
            is_active=True,
        )
        self.settings.set_salt_key("test_secret_key_12345")
        self.settings.save()

    def test_checksum_computation_and_verification(self):
        payload = '{"amount": 1000}'
        endpoint = "/pg/v1/pay"
        salt = "test_secret_key_12345"
        index = 1

        chk = compute_sha256_checksum(payload, endpoint, salt, index)
        self.assertTrue(chk.endswith("###1"))
        self.assertTrue(verify_phonepe_checksum(payload, endpoint, chk, salt, index))
        self.assertFalse(verify_phonepe_checksum(payload, endpoint, "invalid###1", salt, index))

    @patch("requests.post")
    def test_initiate_payment_creates_pending_transaction(self, mock_post):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": True,
            "data": {
                "transactionId": "TXN_PHONEPE_123",
                "instrumentResponse": {
                    "redirectInfo": {"url": "https://mercury-uat.phonepe.com/transact/pay"}
                },
            },
        }
        mock_post.return_value = mock_response

        res = PhonePeGatewayService.initiate_payment(
            amount=Decimal("1500.00"),
            customer=None,
            source_type="EMI",
            source_id=42,
            redirect_url="https://subidha.com/customer/emis/",
        )

        self.assertTrue(res["success"])
        self.assertIn("SUB-", res["merchant_transaction_id"])
        self.assertEqual(res["checkout_url"], "https://mercury-uat.phonepe.com/transact/pay")

        tx = OnlineGatewayTransaction.objects.get(merchant_transaction_id=res["merchant_transaction_id"])
        self.assertEqual(tx.status, OnlineGatewayStatus.PENDING)
        self.assertEqual(tx.amount, Decimal("1500.00"))
        self.assertEqual(tx.source_id, 42)

    @patch("requests.get")
    def test_test_connection_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"code": "TRANSACTION_NOT_FOUND", "success": False}
        mock_get.return_value = mock_response

        res = PhonePeGatewayService.test_connection(self.settings)
        self.assertTrue(res["success"])
        self.settings.refresh_from_db()
        self.assertTrue(self.settings.last_test_success)
        self.assertIn("Connected successfully", self.settings.last_test_message)

    def test_initiate_payment_fails_when_disabled(self):
        from django.core.exceptions import ValidationError
        self.settings.is_enabled = False
        self.settings.save()

        with self.assertRaises(ValidationError) as ctx:
            PhonePeGatewayService.initiate_payment(
                amount=Decimal("1500.00"),
                customer=None,
                source_type="EMI",
                source_id=42,
            )
        self.assertIn("disabled", str(ctx.exception).lower())
