from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, JournalEntry
from branch_control.models import Branch, BranchStatus
from reconciliation.models import ReconciliationRun
from subscriptions.models import Payment
from tests.helpers import create_admin_user, create_customer_user, create_product


class AdminSetupReadinessApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="setup_readiness_admin", phone="9102000001")
        self.customer = create_customer_user(username="setup_readiness_customer", phone="9102000002")

    def test_setup_readiness_endpoint_is_admin_only(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_setup_readiness_returns_required_sections(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertIn("summary", response.data)
        self.assertIn("sections", response.data)
        self.assertIn("finance_accounts", response.data)
        self.assertIn("launch_checklist", response.data)
        self.assertTrue(response.data["read_only"])

        section_keys = {row["key"] for row in response.data["sections"]}
        self.assertEqual(
            {
                "business_profile",
                "print_branding",
                "chart_of_accounts",
                "finance_accounts",
                "branch_cash_counter",
                "staff_roles",
                "product_catalog",
                "batch_lucky_ids",
                "payment_collection",
                "document_templates",
                "accounting_reconciliation",
                "amendment_recontract",
            },
            section_keys,
        )

    def test_finance_account_blocker_appears_for_non_posting_coa(self):
        self.client.force_authenticate(self.admin)
        branch = Branch.objects.filter(is_primary=True).first()
        if branch:
            branch.status = BranchStatus.ACTIVE
            branch.save(update_fields=["status"])

        parent_account = ChartOfAccount.objects.create(
            code="SETUP-GROUP",
            name="Setup Group Asset",
            account_type=ChartOfAccountType.ASSET,
            allow_manual_posting=False,
            is_active=True,
        )
        FinanceAccount.objects.create(
            name="Blocked Collection Account",
            kind=FinanceAccountKind.CASH,
            chart_account=parent_account,
            branch=branch,
            opening_balance=Decimal("0.00"),
            is_active=True,
        )
        create_product(product_code="SR-001")

        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        finance_rows = response.data["finance_accounts"]
        blocked = [row for row in finance_rows if row["name"] == "Blocked Collection Account"]
        self.assertEqual(len(blocked), 1)
        self.assertFalse(blocked[0]["posting_ready"])
        self.assertIn("group/control account", blocked[0]["blocker_reason"])

        sections = {row["key"]: row for row in response.data["sections"]}
        self.assertEqual(sections["finance_accounts"]["status"], "BLOCKED")

    def test_setup_readiness_is_read_only_for_financial_records(self):
        self.client.force_authenticate(self.admin)
        before = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }

        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        after = {
            "payments": Payment.objects.count(),
            "journals": JournalEntry.objects.count(),
            "reconciliation_runs": ReconciliationRun.objects.count(),
        }
        self.assertEqual(before, after)

    def test_legacy_setup_readiness_alias_still_returns_payload(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/setup-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
