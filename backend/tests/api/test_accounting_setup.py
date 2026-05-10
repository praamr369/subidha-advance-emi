from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
)
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
        self.assertIn("missing_required_accounts", response.data)
        self.assertIn("missing_required_mappings", response.data)
        self.assertIn("chart_accounts_total", response.data)
        self.assertIn("setup_complete", response.data)
        self.assertIn("blocking_reasons", response.data)

    def test_admin_can_get_mapping_suggestions(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/mapping-suggestions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("suggestions", response.data)

    def test_setup_status_is_needs_attention_when_warnings_exist(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        cash = ChartOfAccount.objects.get(system_code="DEFAULT_ASSET_CASH_IN_HAND")
        bank = FinanceAccount.objects.get(name__iexact="Main Bank Account")
        FinanceAccount.objects.filter(pk=bank.pk).update(chart_account=cash)
        payload = AccountingSetupService.validate_accounting_setup()
        self.assertEqual(payload["status"], "NEEDS_ATTENTION")
        self.assertGreater(payload["warnings_count"], 0)

    def test_setup_status_is_ready_only_when_warning_count_zero(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        payload = AccountingSetupService.validate_accounting_setup()
        if payload["warnings_count"] > 0:
            AccountingSetupService.repair_suggested_mappings(actor=self.admin, dry_run=False)
            payload = AccountingSetupService.validate_accounting_setup()
        self.assertEqual(payload["warnings_count"], 0)
        self.assertEqual(payload["status"], "READY")

    def test_repair_suggested_mappings_repairs_bank_and_upi_primary_charts(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        cash = ChartOfAccount.objects.get(system_code="DEFAULT_ASSET_CASH_IN_HAND")
        bank = FinanceAccount.objects.get(name__iexact="Main Bank Account")
        upi = FinanceAccount.objects.get(name__iexact="UPI Account")
        FinanceAccount.objects.filter(pk=bank.pk).update(chart_account=cash)
        FinanceAccount.objects.filter(pk=upi.pk).update(chart_account=cash)

        AccountingSetupService.repair_suggested_mappings(actor=self.admin, dry_run=False)
        bank.refresh_from_db()
        upi.refresh_from_db()

        self.assertEqual(bank.chart_account.system_code, "DEFAULT_ASSET_BANK_ACCOUNT")
        self.assertEqual(upi.chart_account.system_code, "DEFAULT_ASSET_UPI_GATEWAY")

    def test_invalid_manual_mapping_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        cash_chart = ChartOfAccount.objects.create(
            code="API-MAP-CASH",
            name="Cash in Hand API",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
            system_code="DEFAULT_ASSET_CASH_IN_HAND",
        )
        bank_chart = ChartOfAccount.objects.create(
            code="API-MAP-BANK",
            name="Bank Account API",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
            system_code="DEFAULT_ASSET_BANK_ACCOUNT",
        )
        bank = FinanceAccount.objects.create(
            name="API Main Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            is_active=True,
            is_real_settlement_account=True,
        )
        response = self.client.post(
            "/api/v1/admin/accounting/finance-account-mappings/",
            {
                "finance_account": bank.pk,
                "chart_account": cash_chart.pk,
                "purpose": FinanceAccountMappingPurpose.BANK_COLLECTION,
                "is_active": True,
                "is_default": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
