from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, FinanceAccountCoaMapping, FinanceAccountMappingPurpose
from accounting.services.accounting_setup_service import AccountingSetupService


User = get_user_model()


class AccountingSetupApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_setup",
            email="admin-setup@example.com",
            password="pass1234",
            phone="01710000001",
            role="ADMIN",
            is_staff=True,
        )
        self.partner = User.objects.create_user(
            username="partner_setup",
            email="partner-setup@example.com",
            password="pass1234",
            phone="01710000002",
            role="PARTNER",
        )

    def test_bootstrap_creates_default_chart_and_mappings(self):
        result = AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        self.assertTrue(ChartOfAccount.objects.filter(system_code="DEFAULT_INC_EMI").exists())
        self.assertGreaterEqual(FinanceAccountCoaMapping.objects.count(), 1)
        self.assertIn(result["validation"]["status"], {"READY", "NEEDS_ATTENTION"})

    def test_bootstrap_is_idempotent(self):
        first = AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        second = AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        self.assertGreaterEqual(first["chart_of_accounts"]["existing"], 0)
        self.assertGreater(second["chart_of_accounts"]["existing"], 0)

    def test_setup_status_detects_missing_required_mapping(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        mapping = FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY,
            is_active=True,
        ).first()
        self.assertIsNotNone(mapping)
        mapping.is_active = False
        mapping.save(update_fields=["is_active", "updated_at"])
        status_payload = AccountingSetupService.validate_accounting_setup()
        self.assertEqual(status_payload["status"], "NEEDS_ATTENTION")
        self.assertTrue(
            any(
                warning["code"] == "MISSING_REQUIRED_PURPOSE"
                for warning in status_payload["warnings"]
            )
        )

    def test_setup_status_is_admin_only(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/accounting/setup/status/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_setup_status(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/setup/status/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)

    def test_admin_can_get_mapping_suggestions(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/mapping-suggestions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("suggestions", response.data)
