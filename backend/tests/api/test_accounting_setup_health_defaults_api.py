from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from accounting.services.finance_account_readiness import finance_account_readiness


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

    def test_finance_account_readiness_metadata_flags_posting_ready(self):
        chart = ChartOfAccount.objects.create(
            code="READY-CASH-001",
            name="Ready Cash Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        finance_account = FinanceAccount.objects.create(
            name="Ready Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=chart,
            is_active=True,
        )

        readiness = finance_account_readiness(finance_account)
        self.assertTrue(readiness.collection_ready)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data["finance_accounts"] if item["id"] == finance_account.id)
        self.assertTrue(row["collection_ready"])
        self.assertTrue(row["mapped_chart_account"]["is_posting"])

    def test_finance_account_readiness_metadata_blocks_non_posting_chart(self):
        chart = ChartOfAccount.objects.create(
            code="BLOCK-CASH-001",
            name="Blocked Cash Control",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=False,
        )
        finance_account = FinanceAccount.objects.create(
            name="Blocked Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=chart,
            is_active=True,
        )

        readiness = finance_account_readiness(finance_account)
        self.assertFalse(readiness.collection_ready)
        self.assertIn("group/control", readiness.collection_blocker_reason)

    def test_mapping_update_rejects_non_posting_chart_account(self):
        current_chart = ChartOfAccount.objects.create(
            code="MAP-CUR-001",
            name="Current Cash Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        blocked_chart = ChartOfAccount.objects.create(
            code="MAP-BLOCK-001",
            name="Blocked Cash Control",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=False,
        )
        finance_account = FinanceAccount.objects.create(
            name="Mapping Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=current_chart,
            is_active=True,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/admin/accounting/finance-accounts/{finance_account.id}/mapping/",
            {"chart_account_id": blocked_chart.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        finance_account.refresh_from_db()
        self.assertEqual(finance_account.chart_account_id, current_chart.id)

    def test_mapping_update_accepts_posting_asset_chart_account(self):
        current_chart = ChartOfAccount.objects.create(
            code="MAP-OLD-001",
            name="Old Cash Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        target_chart = ChartOfAccount.objects.create(
            code="MAP-NEW-001",
            name="New Cash Ledger",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        finance_account = FinanceAccount.objects.create(
            name="Editable Mapping Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=current_chart,
            is_active=True,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/admin/accounting/finance-accounts/{finance_account.id}/mapping/",
            {"chart_account_id": target_chart.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        finance_account.refresh_from_db()
        self.assertEqual(finance_account.chart_account_id, target_chart.id)
