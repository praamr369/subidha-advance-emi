from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from accounting.services.accounting_setup_service import AccountingSetupService, REQUIRED_COA_SYSTEM_CODES
from accounting.services.accounting_setup_status import compute_accounting_master_metrics, get_admin_accounting_setup_status

User = get_user_model()


class AccountingSetupStatusTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="acct_status_admin",
            email="acct-status@example.com",
            password="pass1234",
            phone="01720000001",
            role="ADMIN",
            is_staff=True,
        )

    def test_master_metrics_count_coa_only_not_finance(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        root = ChartOfAccount.objects.filter(parent_id__isnull=True).first()
        self.assertIsNotNone(root)
        ChartOfAccount.objects.create(
            code="CHILD-METRIC-01",
            name="Child Metric",
            account_type=root.account_type,
            parent=root,
            is_active=True,
            allow_manual_posting=True,
        )
        metrics = compute_accounting_master_metrics()
        coa_n = ChartOfAccount.objects.count()
        fa_n = FinanceAccount.objects.count()
        self.assertEqual(metrics["chart_accounts_total"], coa_n)
        self.assertEqual(metrics["finance_accounts_total"], fa_n)
        self.assertEqual(metrics["chart_accounts_child"], ChartOfAccount.objects.exclude(parent_id__isnull=True).count())
        self.assertEqual(metrics["chart_accounts_root"], ChartOfAccount.objects.filter(parent_id__isnull=True).count())

    def test_admin_status_includes_canonical_fields(self):
        self.client.force_authenticate(self.admin)
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        response = self.client.get("/api/v1/admin/accounting/setup/status/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertIn("chart_accounts_total", data)
        self.assertIn("chart_accounts_active", data)
        self.assertIn("chart_accounts_root", data)
        self.assertIn("chart_accounts_child", data)
        self.assertIn("finance_accounts_total", data)
        self.assertIn("finance_accounts_active", data)
        self.assertEqual(data["required_system_accounts_total"], len(REQUIRED_COA_SYSTEM_CODES))
        self.assertIn("required_mappings_total", data)
        self.assertIn("journal_ready", data)
        self.assertIn("setup_complete", data)
        self.assertIn("blocking_reasons", data)
        self.assertIsInstance(data["blocking_reasons"], list)
        self.assertIn("setup_health_status", data)
        self.assertIn("setup_health_blockers_count", data)
        self.assertIn("setup_health_warnings_count", data)
        self.assertIn("posting_readiness", data)
        self.assertIn("reconciliation_readiness", data)

    def test_chart_list_respects_page_size_query(self):
        self.client.force_authenticate(self.admin)
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        base = ChartOfAccount.objects.count()
        for i in range(15):
            ChartOfAccount.objects.create(
                code=f"PAGESZ-{i:03d}",
                name=f"Page Size Row {i}",
                account_type=ChartOfAccountType.EXPENSE,
                is_active=True,
                allow_manual_posting=True,
            )
        total = base + 15
        r20 = self.client.get("/api/v1/accounting/chart-of-accounts/", {"page_size": 20})
        self.assertEqual(r20.status_code, status.HTTP_200_OK)
        self.assertEqual(r20.data["count"], total)
        self.assertEqual(len(r20.data["results"]), 20)
        r80 = self.client.get("/api/v1/accounting/chart-of-accounts/", {"page_size": 80})
        self.assertEqual(len(r80.data["results"]), min(80, total))

    def test_finance_account_create_rejects_non_asset_chart_for_settlement(self):
        self.client.force_authenticate(self.admin)
        liability = ChartOfAccount.objects.create(
            code="FA-LIAB-01",
            name="Liability For FA Test",
            account_type=ChartOfAccountType.LIABILITY,
            is_active=True,
            allow_manual_posting=True,
        )
        response = self.client.post(
            "/api/v1/accounting/finance-accounts/",
            {
                "name": "Bad Settlement",
                "kind": FinanceAccountKind.CASH,
                "chart_account": liability.pk,
                "opening_balance": "0.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("chart_account", response.data)

    def test_get_admin_payload_matches_validate_plus_metrics(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)
        full = get_admin_accounting_setup_status()
        self.assertEqual(full["journal_ready"], full["mappings_complete"])
        self.assertEqual(full["setup_complete"], full["mappings_complete"])
        self.assertIn(full["posting_readiness"], {"READY", "BLOCKED"})
        self.assertIn(full["reconciliation_readiness"], {"READY", "BLOCKED"})
