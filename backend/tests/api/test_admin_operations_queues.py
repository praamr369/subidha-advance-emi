from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class AdminOperationsQueueApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin_ops", "admin-ops@example.com", "pass1234", phone="01720000001", role="ADMIN", is_staff=True)
        self.partner = User.objects.create_user("partner_ops", "partner-ops@example.com", "pass1234", phone="01720000002", role="PARTNER")

    def test_admin_queue_summary_permissions(self):
        self.client.force_authenticate(user=self.partner)
        denied = self.client.get("/api/v1/admin/operations/queue-summary/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        ok = self.client.get("/api/v1/admin/operations/queue-summary/")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn("results", ok.data)
        keys = {row["key"] for row in ok.data["results"]}
        self.assertIn("partner_payment_requests_pending", keys)
        self.assertIn("subscription_requests_pending", keys)
        self.assertIn("customer_kyc_pending", keys)
        self.assertIn("deposit_refunds_pending", keys)
        self.assertIn("reconciliation_pending", keys)
        self.assertIn("overdue_payments", keys)

    def test_admin_partner_payment_requests_permissions(self):
        self.client.force_authenticate(user=self.partner)
        denied = self.client.get("/api/v1/admin/partner-payment-requests/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        ok = self.client.get("/api/v1/admin/partner-payment-requests/")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertIn("results", ok.data)
