from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_user
from system_jobs.models import Notification


class NotificationApiTests(APITestCase):
    def setUp(self):
        self.customer = create_user(
            username="notif_customer",
            password="NotifPass123!",
            role="CUSTOMER",
            phone="9000100001",
        )
        self.partner = create_user(
            username="notif_partner",
            password="NotifPass123!",
            role="PARTNER",
            phone="9000100002",
        )
        self.cashier = create_user(
            username="notif_cashier",
            password="NotifPass123!",
            role="CASHIER",
            phone="9000100003",
        )

        self.customer_notification = Notification.objects.create(
            recipient=self.customer,
            module="customer",
            title="Customer due",
            body="Direct sale due reminder.",
            payload={"category": "DIRECT_SALE_DUE", "severity": "INFO"},
        )
        self.partner_notification = Notification.objects.create(
            recipient=self.partner,
            module="partner",
            title="Commission approved",
            body="Commission workflow updated.",
            payload={"category": "COMMISSION_APPROVED", "severity": "HIGH"},
        )

    def test_notification_list_is_user_scoped(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.customer_notification.id)

    def test_cross_role_notification_mark_read_denied(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(f"/api/v1/notifications/{self.partner_notification.id}/read/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_read_and_summary_work(self):
        self.client.force_authenticate(user=self.partner)
        mark_response = self.client.post(f"/api/v1/notifications/{self.partner_notification.id}/read/")
        self.assertEqual(mark_response.status_code, status.HTTP_200_OK)
        self.assertTrue(mark_response.data["is_read"])

        summary_response = self.client.get("/api/v1/notifications/summary/")
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data["unread_count"], 0)
        self.assertEqual(summary_response.data["high_priority_count"], 0)

    def test_mark_all_read_is_user_scoped(self):
        Notification.objects.create(
            recipient=self.cashier,
            module="cashier",
            title="Receipt created",
            body="Cashier receipt available.",
            payload={"category": "RECEIPT_CREATED", "severity": "INFO"},
        )
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post("/api/v1/notifications/mark-all-read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated_count"], 1)
