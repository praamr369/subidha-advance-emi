from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AccountingSetupHealthDefaultsApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_setup_health",
            email="admin-setup-health@example.com",
            password="pass1234",
            phone="01710009001",
            role="ADMIN",
            is_staff=True,
        )
        self.partner = User.objects.create_user(
            username="partner_setup_health",
            email="partner-setup-health@example.com",
            password="pass1234",
            phone="01710009002",
            role="PARTNER",
        )

    def test_setup_health_is_admin_only(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/accounting/setup-health/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_setup_health(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/setup-health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)
        self.assertIn("blockers", response.data)
        self.assertIn("warnings", response.data)
        self.assertIn("canonical_accounts", response.data)
        self.assertIn("finance_accounts", response.data)
        self.assertIn("posting_profiles", response.data)

    def test_preview_defaults_requires_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/v1/admin/accounting/setup-defaults/preview/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("canonical_accounts", response.data)
        self.assertIn("finance_accounts", response.data)

    def test_apply_defaults_requires_confirm_true(self):
        self.client.force_authenticate(user=self.admin)
        missing = self.client.post("/api/v1/admin/accounting/setup-defaults/apply/", {}, format="json")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

        falsey = self.client.post(
            "/api/v1/admin/accounting/setup-defaults/apply/",
            {"confirm": False},
            format="json",
        )
        self.assertEqual(falsey.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apply_defaults_runs_when_confirmed(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/accounting/setup-defaults/apply/",
            {"confirm": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("canonical_accounts", response.data)
        self.assertIn("posting_profiles", response.data)

