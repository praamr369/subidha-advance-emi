from decimal import Decimal
from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminPaymentApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user()
        self.client.force_authenticate(user=self.admin)

        self.partner = create_partner_user()
        self.customer = create_customer_profile(name="Amrita", phone="7407533262")
        self.product = create_product(base_price=Decimal("15000.00"))
        self.batch = create_batch()
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=4)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1000.00"),
        )

        # Primary EMI used in most tests
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 7),
        )

        # Keep the subscription ACTIVE after first EMI payment so duplicate-safe
        # collect can still reach the service layer and return the existing payment.
        self.future_emi = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 7),
        )
        self.cash_finance = FinanceAccount.objects.create(
            name="Admin Cash Counter",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="ADM-PAY-CASH-001",
                name="Admin Payment Cash",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )

    def test_admin_payment_collect_success(self):
        response = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-001",
                "notes": "admin collect test",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response: {response.status_code} {response.data}",
        )
        self.assertIn("payment", response.data)
        self.assertIn("emi", response.data)
        self.assertIn("subscription", response.data)
        self.assertTrue(response.data["created"])

    def test_admin_payment_collect_duplicate_safe(self):
        first = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-002",
            },
            format="json",
        )
        second = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-002",
            },
            format="json",
        )

        self.assertEqual(
            first.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected first collect response: {first.status_code} {first.data}",
        )
        self.assertEqual(
            second.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected duplicate collect response: {second.status_code} {second.data}",
        )
        self.assertFalse(second.data["created"])

    def test_admin_payment_reverse_success(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-003",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before reverse: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        response = self.client.post(
            f"/api/v1/admin/payments/{payment_id}/reverse/",
            {"reason": "test reversal"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected reverse response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["detail"], "Payment reversed successfully.")

    def test_admin_payment_reverse_requires_reason(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-004",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before reverse validation test: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        response = self.client.post(
            f"/api/v1/admin/payments/{payment_id}/reverse/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reason", response.data)

    def test_admin_payment_second_reverse_blocked(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-005",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before second reverse test: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        first = self.client.post(
            f"/api/v1/admin/payments/{payment_id}/reverse/",
            {"reason": "first reversal"},
            format="json",
        )
        second = self.client.post(
            f"/api/v1/admin/payments/{payment_id}/reverse/",
            {"reason": "second reversal"},
            format="json",
        )

        self.assertEqual(
            first.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected first reverse response: {first.status_code} {first.data}",
        )
        self.assertEqual(
            second.status_code,
            status.HTTP_400_BAD_REQUEST,
            msg=f"Unexpected second reverse response: {second.status_code} {second.data}",
        )
        self.assertEqual(second.data["detail"], "Payment is already reversed.")

    def test_admin_payment_timeline_works(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-006",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before timeline test: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        response = self.client.get(f"/api/v1/admin/payments/{payment_id}/timeline/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected timeline response: {response.status_code} {response.data}",
        )
        self.assertIn("payment", response.data)
        self.assertIn("timeline", response.data)

    def test_admin_payment_create_blocked(self):
        response = self.client.post(
            "/api/v1/admin/payments/",
            {"emi": self.emi.id, "amount": "1000.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_admin_payment_patch_blocked(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-007",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before patch-block test: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        response = self.client.patch(
            f"/api/v1/admin/payments/{payment_id}/",
            {"amount": "500.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_admin_payment_delete_blocked(self):
        collect = self.client.post(
            "/api/v1/admin/payments/collect/",
            {
                "emi": self.emi.id,
                "amount": "1000.00",
                "payment_method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "payment_date": "2026-03-17",
                "reference_no": "ADM-API-008",
            },
            format="json",
        )
        self.assertEqual(
            collect.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected collect response before delete-block test: {collect.status_code} {collect.data}",
        )
        payment_id = collect.data["payment"]["id"]

        response = self.client.delete(f"/api/v1/admin/payments/{payment_id}/")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
