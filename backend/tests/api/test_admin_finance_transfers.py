from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, MoneyMovement
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user


class AdminFinanceTransferApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="finance_transfer_admin")
        self.cashier = create_cashier_user(username="finance_transfer_cashier")
        seed_bridge_ready_environment(performed_by=self.admin)
        self.cash = FinanceAccount.objects.create(
            name="Transfer Cash Desk",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(code="TRF-CASH-001", name="Transfer Cash Chart", account_type=ChartOfAccountType.ASSET),
            opening_balance=Decimal("0.00"),
        )
        self.bank = FinanceAccount.objects.create(
            name="Transfer Main Bank",
            kind=FinanceAccountKind.BANK,
            chart_account=ChartOfAccount.objects.create(code="TRF-BANK-001", name="Transfer Bank Chart", account_type=ChartOfAccountType.ASSET),
            opening_balance=Decimal("0.00"),
            bank_last4="7788",
        )
        self.payload = {
            "movement_date": "2026-06-29",
            "from_finance_account_id": self.cash.id,
            "to_finance_account_id": self.bank.id,
            "amount": "500.00",
            "reference_no": "TRF-REF-001",
            "notes": "Transfer test note.",
        }

    def test_preview_is_admin_only_and_read_only(self):
        self.client.force_authenticate(user=self.cashier)
        denied = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "preview": True}, format="json")
        self.assertIn(denied.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.client.force_authenticate(user=self.admin)
        before_count = MoneyMovement.objects.count()
        response = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "preview": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(MoneyMovement.objects.count(), before_count)
        self.assertTrue(response.data["data"]["can_post"])
        self.assertTrue(response.data["data"]["idempotency_key"].startswith("finance-transfer-"))

    def test_post_requires_confirmation_and_is_idempotent(self):
        self.client.force_authenticate(user=self.admin)
        missing_confirm = self.client.post("/api/v1/admin/finance-transfers/", self.payload, format="json")
        self.assertEqual(missing_confirm.status_code, status.HTTP_400_BAD_REQUEST)

        preview = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "preview": True}, format="json")
        key = preview.data["data"]["idempotency_key"]
        first = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "confirm": True, "idempotency_key": key}, format="json")
        second = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "confirm": True, "idempotency_key": key}, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertTrue(first.data["data"]["created"])
        self.assertFalse(second.data["data"]["created"])
        self.assertEqual(MoneyMovement.objects.filter(reference_no="TRF-REF-001").count(), 1)

    def test_list_is_paginated_and_hides_internal_marker(self):
        self.client.force_authenticate(user=self.admin)
        preview = self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "preview": True}, format="json")
        self.client.post("/api/v1/admin/finance-transfers/", {**self.payload, "confirm": True, "idempotency_key": preview.data["data"]["idempotency_key"]}, format="json")
        response = self.client.get("/api/v1/admin/finance-transfers/?page=1&page_size=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertNotIn("finance_transfer_idempotency_key", response.data["results"][0].get("notes") or "")
