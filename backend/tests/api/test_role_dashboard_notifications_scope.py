from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import Vendor
from system_jobs.models import Notification
from tests.helpers import (
    create_customer_profile,
    create_partner_user,
    create_user,
)


class RoleDashboardNotificationScopeTests(APITestCase):
    def setUp(self):
        self.customer_user = create_user(
            username="scope_customer",
            role="CUSTOMER",
            phone="9310100001",
        )
        self.partner_user = create_partner_user(
            username="scope_partner",
            phone="9310100002",
        )
        self.vendor_user = create_user(
            username="scope_vendor",
            role="VENDOR",
            phone="9310100003",
        )
        self.other_customer_user = create_user(
            username="scope_customer_other",
            role="CUSTOMER",
            phone="9310100004",
        )
        create_customer_profile(user=self.customer_user, name="Scope Customer", phone="9310100001")
        create_customer_profile(user=self.other_customer_user, name="Scope Customer Other", phone="9310100004")
        Vendor.objects.create(name="Scope Vendor", linked_user=self.vendor_user, phone="9310100003")

        self.customer_notification = Notification.objects.create(
            recipient=self.customer_user,
            module="customer",
            title="Your next payment is due soon",
            body="Please review your upcoming dues.",
            payload={"category": "PAYMENT", "severity": "MEDIUM"},
        )
        self.other_customer_notification = Notification.objects.create(
            recipient=self.other_customer_user,
            module="customer",
            title="Other customer notification",
            body="Should not be visible across users.",
            payload={"category": "PAYMENT", "severity": "LOW"},
        )

    def test_customer_summary_and_notifications_are_role_scoped(self):
        self.client.force_authenticate(self.customer_user)
        summary = self.client.get("/api/v1/customer/dashboard/summary/")
        self.assertEqual(summary.status_code, status.HTTP_200_OK)

        notifications = self.client.get("/api/v1/customer/notifications/")
        self.assertEqual(notifications.status_code, status.HTTP_200_OK)
        results = notifications.data.get("results", [])
        ids = {item["id"] for item in results}
        self.assertIn(self.customer_notification.id, ids)
        self.assertNotIn(self.other_customer_notification.id, ids)

    def test_partner_cannot_access_customer_or_vendor_role_endpoints(self):
        self.client.force_authenticate(self.partner_user)
        self.assertEqual(
            self.client.get("/api/v1/customer/dashboard/summary/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get("/api/v1/vendor/dashboard/summary/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get("/api/v1/partner/dashboard/summary/").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get("/api/v1/partner/notifications/summary/").status_code,
            status.HTTP_200_OK,
        )

    def test_vendor_cannot_access_customer_or_partner_role_endpoints(self):
        self.client.force_authenticate(self.vendor_user)
        self.assertEqual(
            self.client.get("/api/v1/customer/dashboard/summary/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get("/api/v1/partner/dashboard/summary/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get("/api/v1/vendor/dashboard/summary/").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get("/api/v1/vendor/notifications/summary/").status_code,
            status.HTTP_200_OK,
        )
