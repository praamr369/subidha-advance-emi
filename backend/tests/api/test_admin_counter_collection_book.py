from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from accounting.services.accounting_setup_service import LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME
from branch_control.models import Branch, BranchStatus
from tests.helpers import create_admin_user


class AdminCounterCollectionBookApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ctr_book_admin", phone="9389300001")
        self.branch = Branch.objects.filter(is_primary=True).first()
        self.assertIsNotNone(self.branch)
        self.branch.status = BranchStatus.ACTIVE
        self.branch.save(update_fields=["status", "updated_at"])
        cash_chart = ChartOfAccount.objects.create(
            code="CTR-TEST-CASH-CH",
            name="CTR Test Cash Chart",
            account_type=ChartOfAccountType.ASSET,
            is_active=True,
            allow_manual_posting=True,
        )
        self.cash_fa = FinanceAccount.objects.create(
            name="CTR Test Cash Desk",
            branch=self.branch,
            kind=FinanceAccountKind.CASH,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        self.bank_fa = FinanceAccount.objects.create(
            name="CTR Test Bank",
            branch=self.branch,
            kind=FinanceAccountKind.BANK,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        self.ledger_fa = FinanceAccount.objects.create(
            name=LEDGER_POSTING_PROFILES_FINANCE_ACCOUNT_NAME,
            branch=self.branch,
            kind=FinanceAccountKind.BANK,
            chart_account=cash_chart,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=False,
        )

    def test_eligible_collection_book_lists_cash_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/v1/accounting/finance-accounts/",
            {"is_active": "1", "for_cash_counter": "1", "branch": str(self.branch.pk)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(self.cash_fa.pk, ids)
        self.assertNotIn(self.bank_fa.pk, ids)
        self.assertNotIn(self.ledger_fa.pk, ids)

    def test_counter_create_rejects_bank_finance_account(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "code": "CTR-BAD-BANK",
            "name": "Bad Counter",
            "branch": self.branch.pk,
            "finance_account": self.bank_fa.pk,
            "assigned_user": None,
            "is_active": True,
            "notes": "",
        }
        response = self.client.post("/api/v1/branch-control/counters/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("finance_account", response.data)

    def test_counter_create_rejects_inactive_finance_account(self):
        self.cash_fa.is_active = False
        self.cash_fa.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)
        payload = {
            "code": "CTR-INACT",
            "name": "Inactive FA",
            "branch": self.branch.pk,
            "finance_account": self.cash_fa.pk,
            "assigned_user": None,
            "is_active": True,
            "notes": "",
        }
        response = self.client.post("/api/v1/branch-control/counters/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_counter_create_rejects_other_branch_finance_account(self):
        other = Branch.objects.create(code="BR-CTR-ISO", name="Iso Branch", status=BranchStatus.ACTIVE)
        other_cash = FinanceAccount.objects.create(
            name="Other Branch Cash",
            branch=other,
            kind=FinanceAccountKind.CASH,
            chart_account=self.cash_fa.chart_account,
            opening_balance=Decimal("0.00"),
            is_active=True,
            is_real_settlement_account=True,
        )
        self.client.force_authenticate(self.admin)
        payload = {
            "code": "CTR-ISO",
            "name": "Iso",
            "branch": self.branch.pk,
            "finance_account": other_cash.pk,
            "assigned_user": None,
            "is_active": True,
            "notes": "",
        }
        response = self.client.post("/api/v1/branch-control/counters/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
