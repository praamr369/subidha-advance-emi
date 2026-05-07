from django.contrib.auth import get_user_model
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import SubscriptionStatus
from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)

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

    def test_overdue_queue_excludes_cancelled_subscription_emi(self):
        customer = create_customer_profile(
            user=create_customer_user(
                username="queue_cancelled_customer",
                phone="01720000011",
            ),
            name="Queue Cancelled Customer",
            phone="01720000011",
        )
        product = create_product(name="Queue Product", product_code="Q-PRD-001")
        batch = create_batch(batch_code="QBATCH01")
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
        )
        subscription.status = SubscriptionStatus.CANCELLED
        subscription.save(update_fields=["status"])
        create_emi(
            subscription=subscription,
            month_no=1,
            amount="100.00",
            due_date=timezone.localdate() - timedelta(days=3),
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/operations/queue-summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        overdue_row = next(
            row for row in response.data["results"] if row["key"] == "overdue_payments"
        )
        self.assertEqual(overdue_row["count"], 0)
