from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import (
    create_cashier_user,
    create_admin_user,
    create_customer_user,
    create_partner_user,
    create_user,
)
from accounts.models import UserRole


class PermissionBoundaryTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_perm")
        self.cashier = create_cashier_user(username="cashier_perm")
        self.partner = create_partner_user(username="partner_perm")
        self.customer = create_customer_user(username="customer_perm")
        self.vendor = create_user(
            username="vendor_perm",
            role=UserRole.VENDOR,
            phone="9001112223",
        )

    def test_admin_payments_allowed_to_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/payments/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_payments_denied_to_partner(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/payments/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_dashboard_denied_to_customer(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/partner/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_cannot_access_admin_business_setup(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_cannot_access_admin_lucky_draw_controls(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.get("/api/v1/admin/lucky-draws/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_cannot_access_vendor_routes(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get("/api/v1/vendor/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_cannot_access_vendor_routes(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/vendor/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_vendor_cannot_access_admin_accounting_routes(self):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.get("/api/v1/accounting/chart-of-accounts/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_vendor_cannot_access_partner_commissions(self):
        self.client.force_authenticate(user=self.vendor)
        response = self.client.get("/api/v1/partner/commissions/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_auth_me_requires_authentication(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_auth_me_returns_partner_role(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "PARTNER")