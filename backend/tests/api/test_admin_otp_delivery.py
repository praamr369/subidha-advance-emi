from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_partner_user


class AdminOtpDeliveryReadinessTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="otp_ready_admin", phone="9300000001")
        self.partner = create_partner_user(
            username="otp_ready_partner",
            phone="9300000002",
        )

    @override_settings(
        DEBUG=False,
        OTP_DELIVERY_BACKEND="auto",
        OTP_ALLOW_EMAIL_FALLBACK=True,
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        DEFAULT_FROM_EMAIL="SUBIDHA CORE <no-reply@example.com>",
    )
    def test_admin_can_view_ready_status_for_email_only_public_reset(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/system/otp-delivery-readiness/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["overall_status"], "READY")
        self.assertEqual(response.data["delivery_backend"], "AUTO")
        self.assertEqual(response.data["sms"]["status"], "NOT_SUPPORTED")
        self.assertEqual(response.data["email"]["status"], "READY")
        self.assertEqual(response.data["admin_visibility"]["status"], "API_ONLY")
        self.assertIn("CUSTOMER", response.data["public_reset_roles"])
        self.assertIn("PARTNER", response.data["public_reset_roles"])
        self.assertIn("email delivery only", response.data["summary"].lower())

    @override_settings(
        DEBUG=True,
        OTP_DELIVERY_BACKEND="console",
        OTP_ALLOW_EMAIL_FALLBACK=False,
        EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend",
        DEFAULT_FROM_EMAIL="SUBIDHA CORE Dev <no-reply@local.subidha>",
    )
    def test_console_mode_is_reported_as_dev_only(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/system/otp-delivery-readiness/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["overall_status"], "DEV_ONLY")
        self.assertEqual(response.data["email"]["status"], "DEV_ONLY")
        self.assertEqual(response.data["console"]["status"], "DEV_ONLY")

    def test_non_admin_cannot_access_readiness_endpoint(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/admin/system/otp-delivery-readiness/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
