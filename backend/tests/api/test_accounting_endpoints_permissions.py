from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType
from tests.helpers import (
    create_admin_user,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_partner_user,
)


class AccountingEndpointsPermissionsTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_api_admin",
            phone="9350000001",
        )
        self.partner = create_partner_user(
            username="accounting_api_partner",
            phone="9350000002",
        )
        self.cashier = create_cashier_user(
            username="accounting_api_cashier",
            phone="9350000003",
        )
        self.customer_user = create_customer_user(
            username="accounting_api_customer",
            phone="7350000001",
        )
        create_customer_profile(
            user=self.customer_user,
            name="Accounting API Customer",
            phone="7350000001",
        )
        self.debit_account = ChartOfAccount.objects.create(
            code="API-EXP-001",
            name="API Expense",
            account_type=ChartOfAccountType.EXPENSE,
        )
        self.credit_account = ChartOfAccount.objects.create(
            code="API-CASH-001",
            name="API Cash",
            account_type=ChartOfAccountType.ASSET,
        )

    def test_non_admin_roles_cannot_access_accounting_registers(self):
        endpoints = [
            "/api/v1/accounting/chart-of-accounts/",
            "/api/v1/accounting/journal-entries/",
            "/api/v1/accounting/expenses/",
            "/api/v1/accounting/salary-sheets/",
        ]
        for user in [self.partner, self.cashier, self.customer_user]:
            self.client.force_authenticate(user=user)
            for endpoint in endpoints:
                response = self.client.get(endpoint)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected access for {user.role} on {endpoint}: {response.status_code}",
                )

    def test_admin_can_create_and_post_manual_journal(self):
        self.client.force_authenticate(user=self.admin)

        create_response = self.client.post(
            "/api/v1/accounting/journal-entries/",
            {
                "entry_date": "2026-04-08",
                "entry_type": "MANUAL",
                "memo": "API journal",
                "lines": [
                    {
                        "chart_account": self.debit_account.id,
                        "description": "Debit",
                        "debit_amount": "100.00",
                        "credit_amount": "0.00",
                    },
                    {
                        "chart_account": self.credit_account.id,
                        "description": "Credit",
                        "debit_amount": "0.00",
                        "credit_amount": "100.00",
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        journal_id = create_response.data["id"]

        post_response = self.client.post(
            f"/api/v1/accounting/journal-entries/{journal_id}/post/",
            {},
            format="json",
        )

        self.assertEqual(post_response.status_code, status.HTTP_200_OK, post_response.data)
        self.assertTrue(post_response.data["updated"])
        self.assertEqual(post_response.data["journal_entry"]["status"], "POSTED")
