from rest_framework import status
from rest_framework.test import APITestCase

from accounts.capabilities import user_has_capability
from accounts.models import Capability, UserCapabilityOverride
from tests.helpers import create_admin_user, create_cashier_user, create_partner_user


class CapabilityMatrixRbacTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="cap_admin", phone="9320000001")
        self.cashier = create_cashier_user(username="cap_cashier", phone="9320000002")
        self.partner = create_partner_user(
            username="cap_partner",
            phone="9320000003",
            email="partner@example.com",
        )

    def test_admin_has_all_critical_capabilities(self):
        critical_codes = [
            "billing.override_allocation",
            "accounting.reverse_entry",
            "batch.lock",
            "draw.commit",
            "draw.complete",
            "inventory.adjust",
            "business_setup.reset",
            "reports.export",
        ]
        for code in critical_codes:
            self.assertTrue(
                user_has_capability(self.admin, code),
                msg=f"Admin should include capability: {code}",
            )

    def test_cashier_cannot_reverse_accounting(self):
        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(
            "/api/v1/accounting/controls/journal-groups/1/reverse/",
            {"reason": "test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(user_has_capability(self.cashier, "accounting.reverse_entry"))

    def test_cashier_can_collect_payment(self):
        self.assertTrue(user_has_capability(self.cashier, "billing.collect"))

    def test_partner_cannot_access_accounting(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/accounting/chart-of-accounts/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(user_has_capability(self.partner, "accounting.view"))

    def test_override_works_only_if_configured(self):
        self.assertFalse(user_has_capability(self.cashier, "accounting.reverse_entry"))
        capability = Capability.objects.get(code="accounting.reverse_entry")
        UserCapabilityOverride.objects.update_or_create(
            user=self.cashier,
            capability=capability,
            defaults={
                "is_allowed": True,
                "created_by": self.admin,
                "updated_by": self.admin,
                "note": "temporary access",
            },
        )
        self.assertTrue(user_has_capability(self.cashier, "accounting.reverse_entry"))

    def test_old_routes_still_work(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
