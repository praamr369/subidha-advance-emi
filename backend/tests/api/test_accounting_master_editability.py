from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from branch_control.models import Branch, CashCounter
from subscriptions.models import AuditLog
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)


class AccountingMasterEditabilityApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_master_admin",
            phone="9371000001",
        )
        self.partner = create_partner_user(
            username="accounting_master_partner",
            phone="9371000002",
        )
        self.cashier = create_cashier_user(
            username="accounting_master_cashier",
            phone="9371000003",
        )
        self.customer_user = create_customer_user(
            username="accounting_master_customer",
            phone="9371000004",
        )
        create_customer_profile(
            user=self.customer_user,
            name="Accounting Master Customer",
            phone="9371000004",
        )

        self.client.force_authenticate(user=self.admin)

        self.branch = Branch.objects.order_by("id").first()
        if self.branch is None:
            self.branch = Branch.objects.create(
                code="MAIN-MASTER",
                name="Main Branch",
                is_primary=True,
            )
        self.root_asset = ChartOfAccount.objects.create(
            code="AST-1000",
            name="Operating Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        self.alt_asset = ChartOfAccount.objects.create(
            code="AST-1010",
            name="Reserve Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        self.expense_account = ChartOfAccount.objects.create(
            code="EXP-5000",
            name="General Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="Operating Cash",
            branch=self.branch,
            kind=FinanceAccountKind.CASH,
            chart_account=self.root_asset,
            opening_balance=Decimal("0.00"),
        )

    def _master_update_audits(self, *, model_name: str, object_id: int):
        return AuditLog.objects.filter(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            model_name=model_name,
            object_id=object_id,
        )

    def _master_update_audit_count(self, *, model_name: str, object_id: int) -> int:
        return self._master_update_audits(
            model_name=model_name,
            object_id=object_id,
        ).count()

    def test_chart_account_detail_includes_editability(self):
        response = self.client.get(f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["code"], "AST-1000")
        self.assertIn("editability", response.data)
        self.assertIn("name", response.data["editability"]["editable_fields"])
        self.assertEqual(
            response.data["editability"]["locked_fields"]["code"],
            "Code is immutable after creation.",
        )

    def test_chart_account_safe_fields_update_successfully(self):
        before_count = self._master_update_audit_count(
            model_name="ChartOfAccount",
            object_id=self.root_asset.id,
        )
        response = self.client.patch(
            f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/",
            {
                "name": "Operating Cash Asset",
                "notes": "Primary asset bucket for operating cash.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.root_asset.refresh_from_db()
        self.assertEqual(self.root_asset.name, "Operating Cash Asset")
        self.assertEqual(self.root_asset.notes, "Primary asset bucket for operating cash.")
        self.assertIn("editability", response.data)
        self.assertEqual(
            self._master_update_audit_count(
                model_name="ChartOfAccount",
                object_id=self.root_asset.id,
            ),
            before_count + 1,
        )
        audit = self._master_update_audits(
            model_name="ChartOfAccount",
            object_id=self.root_asset.id,
        ).latest("id")
        self.assertEqual(audit.performed_by_id, self.admin.id)
        self.assertEqual(audit.metadata.get("event"), "ACCOUNTING_MASTER_UPDATED")
        self.assertEqual(audit.metadata.get("changed_fields"), ["name", "notes"])

    def test_non_admin_cannot_patch_chart_account(self):
        for user in [self.partner, self.cashier, self.customer_user]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user=user)
                response = self.client.patch(
                    f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/",
                    {"name": f"Blocked {user.role}"},
                    format="json",
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected chart account patch access for {user.role}: {response.status_code}",
                )

    def test_unauthenticated_cannot_patch_chart_account(self):
        self.client.force_authenticate(user=None)

        response = self.client.patch(
            f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/",
            {"name": "Blocked anonymous"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, response.data)

    def test_chart_account_editability_endpoint_returns_wrapped_policy(self):
        response = self.client.get(
            f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/editability/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["id"], self.root_asset.id)
        self.assertIn("locked_fields", response.data["editability"])

    def test_chart_account_locked_fields_reject_when_used(self):
        used_account = ChartOfAccount.objects.create(
            code="AST-1020",
            name="Used Asset",
            account_type=ChartOfAccountType.ASSET,
        )
        FinanceAccount.objects.create(
            name="Used Bank",
            branch=self.branch,
            kind=FinanceAccountKind.BANK,
            chart_account=used_account,
            opening_balance=Decimal("0.00"),
        )
        before_count = self._master_update_audit_count(
            model_name="ChartOfAccount",
            object_id=used_account.id,
        )

        response = self.client.patch(
            f"/api/v1/accounting/chart-of-accounts/{used_account.id}/",
            {
                "parent": self.root_asset.id,
                "allow_manual_posting": False,
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("parent", response.data)
        self.assertIn("allow_manual_posting", response.data)
        self.assertIn("is_active", response.data)
        self.assertEqual(
            self._master_update_audit_count(
                model_name="ChartOfAccount",
                object_id=used_account.id,
            ),
            before_count,
        )

    def test_chart_account_code_account_type_and_system_code_are_immutable(self):
        response = self.client.patch(
            f"/api/v1/accounting/chart-of-accounts/{self.expense_account.id}/",
            {
                "code": "EXP-5999",
                "account_type": ChartOfAccountType.ASSET,
                "system_code": "EXPENSE_OVERRIDE",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data["code"][0], "Code is immutable after creation.")
        self.assertEqual(
            response.data["account_type"][0],
            "Account type is immutable after creation.",
        )
        self.assertEqual(
            response.data["system_code"][0],
            "System code is immutable after creation.",
        )

    def test_finance_account_detail_includes_editability(self):
        response = self.client.get(f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("editability", response.data)
        self.assertIn("name", response.data["editability"]["editable_fields"])
        self.assertIn("chart_account", response.data["editability"]["editable_fields"])

    def test_finance_account_safe_fields_update_successfully(self):
        self.finance_account.kind = FinanceAccountKind.UPI
        self.finance_account.upi_handle = "old@upi"
        self.finance_account.save(update_fields=["kind", "upi_handle", "updated_at"])
        before_count = self._master_update_audit_count(
            model_name="FinanceAccount",
            object_id=self.finance_account.id,
        )

        response = self.client.patch(
            f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/",
            {
                "name": "Main UPI Wallet",
                "upi_handle": "new@upi",
                "notes": "Primary UPI collection account.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.finance_account.refresh_from_db()
        self.assertEqual(self.finance_account.name, "Main UPI Wallet")
        self.assertEqual(self.finance_account.upi_handle, "new@upi")
        self.assertEqual(self.finance_account.notes, "Primary UPI collection account.")
        self.assertEqual(
            self._master_update_audit_count(
                model_name="FinanceAccount",
                object_id=self.finance_account.id,
            ),
            before_count + 1,
        )
        audit = self._master_update_audits(
            model_name="FinanceAccount",
            object_id=self.finance_account.id,
        ).latest("id")
        self.assertEqual(audit.performed_by_id, self.admin.id)
        self.assertEqual(audit.metadata.get("event"), "ACCOUNTING_MASTER_UPDATED")
        self.assertEqual(audit.metadata.get("changed_fields"), ["name", "upi_handle", "notes"])

    def test_non_admin_cannot_patch_finance_account(self):
        for user in [self.partner, self.cashier, self.customer_user]:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user=user)
                response = self.client.patch(
                    f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/",
                    {"name": f"Blocked {user.role}"},
                    format="json",
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected finance account patch access for {user.role}: {response.status_code}",
                )

    def test_unauthenticated_cannot_patch_finance_account(self):
        self.client.force_authenticate(user=None)

        response = self.client.patch(
            f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/",
            {"name": "Blocked anonymous"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, response.data)

    def test_finance_account_editability_endpoint_returns_wrapped_policy(self):
        response = self.client.get(
            f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/editability/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["id"], self.finance_account.id)
        self.assertIn("editable_fields", response.data["editability"])

    def test_finance_account_locked_fields_reject_when_used(self):
        finance_account = FinanceAccount.objects.create(
            name="Front Counter Cash",
            branch=self.branch,
            kind=FinanceAccountKind.CASH,
            chart_account=self.root_asset,
            opening_balance=Decimal("0.00"),
        )
        CashCounter.objects.create(
            code="CTR-1",
            name="Counter 1",
            branch=self.branch,
            finance_account=finance_account,
        )
        before_count = self._master_update_audit_count(
            model_name="FinanceAccount",
            object_id=finance_account.id,
        )

        response = self.client.patch(
            f"/api/v1/accounting/finance-accounts/{finance_account.id}/",
            {
                "chart_account": self.alt_asset.id,
                "kind": FinanceAccountKind.BANK,
                "opening_balance": "10.00",
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("chart_account", response.data)
        self.assertIn("kind", response.data)
        self.assertIn("opening_balance", response.data)
        self.assertIn("is_active", response.data)
        self.assertEqual(
            self._master_update_audit_count(
                model_name="FinanceAccount",
                object_id=finance_account.id,
            ),
            before_count,
        )

    def test_finance_account_hard_delete_not_available(self):
        response = self.client.delete(f"/api/v1/accounting/finance-accounts/{self.finance_account.id}/")

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED, response.data)

    def test_chart_account_hard_delete_not_available(self):
        response = self.client.delete(f"/api/v1/accounting/chart-of-accounts/{self.root_asset.id}/")

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED, response.data)

    def test_finance_account_deactivate_behavior_is_blocked_when_in_use(self):
        finance_account = FinanceAccount.objects.create(
            name="Busy Cash",
            branch=self.branch,
            kind=FinanceAccountKind.CASH,
            chart_account=self.root_asset,
            opening_balance=Decimal("0.00"),
        )
        CashCounter.objects.create(
            code="CTR-2",
            name="Counter 2",
            branch=self.branch,
            finance_account=finance_account,
        )

        response = self.client.patch(
            f"/api/v1/accounting/finance-accounts/{finance_account.id}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("is_active", response.data)
