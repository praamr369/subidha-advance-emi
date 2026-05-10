from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType
from tests.helpers import create_admin_user, create_partner_user


class ChartOfAccountCreateApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="coa_create_admin", phone="9188000001")
        self.partner = create_partner_user(username="coa_create_partner", phone="9188000002")
        self.asset_parent = ChartOfAccount.objects.create(
            code="AST-PARENT",
            name="Asset Parent",
            account_type=ChartOfAccountType.ASSET,
        )
        self.liability = ChartOfAccount.objects.create(
            code="LIA-100",
            name="Liability Root",
            account_type=ChartOfAccountType.LIABILITY,
        )

    def test_admin_can_create_manual_coa_with_auto_code(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/accounting/chart-of-accounts/",
            {
                "name": "Petty Cash Branch",
                "account_type": "ASSET",
                "parent": self.asset_parent.id,
                "is_active": True,
                "allow_manual_posting": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["name"], "Petty Cash Branch")
        self.assertIsNotNone(response.data.get("code"))
        self.assertFalse(response.data.get("system_code"))
        created = ChartOfAccount.objects.get(pk=response.data["id"])
        self.assertEqual(created.parent_id, self.asset_parent.id)

    def test_partner_cannot_create_coa(self):
        self.client.force_authenticate(self.partner)
        response = self.client.post(
            "/api/v1/accounting/chart-of-accounts/",
            {"name": "Illegal", "account_type": "ASSET"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_code_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/accounting/chart-of-accounts/",
            {
                "code": "AST-PARENT",
                "name": "Duplicate Code",
                "account_type": "ASSET",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_invalid_parent_type_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/accounting/chart-of-accounts/",
            {
                "name": "Bad child",
                "account_type": "ASSET",
                "parent": self.liability.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent", response.data)

    def test_system_code_in_payload_is_ignored(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/accounting/chart-of-accounts/",
            {
                "name": "No System Hijack",
                "account_type": "EXPENSE",
                "system_code": "DEFAULT_EXP_WAIVER_LOSS",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data.get("system_code"))
        row = ChartOfAccount.objects.get(pk=response.data["id"])
        self.assertIsNone(row.system_code)
