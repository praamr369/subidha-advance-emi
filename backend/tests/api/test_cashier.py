from decimal import Decimal
from datetime import date, timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind
from subscriptions.models import SubscriptionStatus
from subscriptions.services.payment_service import record_emi_payment, reverse_payment_for_admin
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    create_user,
)


class CashierApiTests(APITestCase):
    def setUp(self):
        today = timezone.localdate()
        self.admin = create_admin_user(username="cash_admin", phone="9000000101")
        self.cashier = create_user(
            username="cashier_test",
            password="CashierPass123!",
            role="CASHIER",
            phone="9000000102",
            first_name="Cashier",
        )

        self.customer = create_customer_profile(name="Amrita", phone="7407533262")
        self.product = create_product(
            name="Bajaj 10 Ltr OTG",
            product_code="BAJAJ-OTG-001",
            base_price=Decimal("2850.00"),
        )
        self.batch = create_batch(
            batch_code="APRIL2026",
            duration_months=15,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=14)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=None,
            total_amount=Decimal("2850.00"),
            monthly_amount=Decimal("190.00"),
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("190.00"),
            due_date=today - timedelta(days=1),
        )
        self.future_emi = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("190.00"),
            due_date=today + timedelta(days=1),
        )
        self.cash_finance = FinanceAccount.objects.create(
            name="Cashier Counter Finance",
            kind=FinanceAccountKind.CASH,
            chart_account=ChartOfAccount.objects.create(
                code="CASHIER-CASH-001",
                name="Cashier Cash",
                account_type=ChartOfAccountType.ASSET,
            ),
            opening_balance=Decimal("0.00"),
        )

    def test_cashier_dashboard_allowed_for_admin(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/cashier/dashboard/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected cashier dashboard response: {response.status_code} {response.data}",
        )
        self.assertIn("total_pending_emis", response.data)
        self.assertIn("total_pending_amount", response.data)
        self.assertIn("today_total_collected", response.data)
        self.assertIn("today_transactions", response.data)

    def test_cashier_dashboard_allowed_for_cashier(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get("/api/v1/cashier/dashboard/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected cashier dashboard response: {response.status_code} {response.data}",
        )

    def test_cashier_dashboard_excludes_reversed_payments_from_active_totals(self):
        today = timezone.localdate()
        active_emi = create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("250.00"),
            due_date=today,
        )
        reversed_emi = create_emi(
            subscription=self.subscription,
            month_no=4,
            amount=Decimal("150.00"),
            due_date=today,
        )
        record_emi_payment(
            emi_id=active_emi.id,
            amount=Decimal("250.00"),
            collected_by=self.cashier,
            method="CASH",
            reference_no="CASH-DASH-ACTIVE-001",
            payment_date=today,
        )
        reversed_payment = record_emi_payment(
            emi_id=reversed_emi.id,
            amount=Decimal("150.00"),
            collected_by=self.cashier,
            method="CASH",
            reference_no="CASH-DASH-REVERSED-001",
            payment_date=today,
        )["payment"]
        reverse_payment_for_admin(
            payment_id=reversed_payment.id,
            reversed_by=self.admin,
            reason="cashier dashboard regression test",
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/cashier/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["today_transaction_count"], 2)
        self.assertEqual(response.data["today_active_transaction_count"], 1)
        self.assertEqual(response.data["today_reversed_transaction_count"], 1)
        self.assertEqual(response.data["today_total_collected"], "250.00")
        self.assertEqual(response.data["today_cash_total"], "250.00")
        self.assertEqual(response.data["today_digital_total"], "0.00")

    def test_cashier_pending_emis_lookup_success(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            f"/api/v1/cashier/pending-emis/?phone={self.customer.phone}"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected pending-emis response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["customer_id"], self.customer.id)
        self.assertEqual(response.data["phone"], self.customer.phone)
        self.assertIn("emis", response.data)
        self.assertGreaterEqual(response.data["total_pending_emis"], 1)
        self.assertIn("overdue_emi_count", response.data)
        self.assertIn("overdue_amount", response.data)
        self.assertIn("next_due_emi_id", response.data)
        self.assertEqual(response.data["overdue_emi_count"], 1)

    def test_cashier_pending_emis_phone_required(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/cashier/pending-emis/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "phone query parameter is required.")

    def test_cashier_pending_emis_customer_not_found(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/cashier/pending-emis/?phone=9999999999")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["detail"], "Customer not found.")

    def test_cashier_pending_emis_excludes_cancelled_subscription(self):
        self.subscription.status = SubscriptionStatus.CANCELLED
        self.subscription.save(update_fields=["status"])
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            f"/api/v1/cashier/pending-emis/?phone={self.customer.phone}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["total_pending_emis"], 0)
        self.assertEqual(response.data["overdue_emi_count"], 0)
        self.assertEqual(response.data["emis"], [])

    def test_cashier_collect_payment_success(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "190.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-001",
                "note": "cashier test payment",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected cashier collect response: {response.status_code} {response.data}",
        )
        self.assertTrue(response.data["created"])
        self.assertIn("payment", response.data)
        self.assertIn("emi", response.data)
        self.assertIn("subscription", response.data)
        self.assertEqual(response.data["payment"]["reference_no"], "CASH-API-001")
        self.assertEqual(response.data["emi"]["status"], "PAID")

    def test_cashier_collect_duplicate_safe(self):
        self.client.force_authenticate(user=self.admin)

        first = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "190.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-002",
                "note": "cashier duplicate test",
            },
            format="json",
        )
        second = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "190.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-002",
                "note": "cashier duplicate test",
            },
            format="json",
        )

        self.assertEqual(
            first.status_code,
            status.HTTP_201_CREATED,
            msg=f"Unexpected first cashier collect response: {first.status_code} {first.data}",
        )
        self.assertEqual(
            second.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected duplicate cashier collect response: {second.status_code} {second.data}",
        )
        self.assertFalse(second.data["created"])

    def test_cashier_collect_requires_emi_id(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "amount": "190.00",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-003",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("emi_id", response.data)

    def test_cashier_collect_requires_amount(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-004",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", response.data)

    def test_cashier_collect_invalid_amount_fails(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/cashier/collect-payment/",
            {
                "emi_id": self.emi.id,
                "amount": "-10",
                "method": "CASH",
                "finance_account_id": self.cash_finance.id,
                "reference_no": "CASH-API-005",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", response.data)

    def test_cashier_dashboard_denied_to_customer(self):
        customer_user = create_user(
            username="cashier_customer_denied",
            password="CustomerPass123!",
            role=UserRole.CUSTOMER,
            phone="9000000103",
            first_name="DeniedCustomer",
        )
        self.client.force_authenticate(user=customer_user)

        response = self.client.get("/api/v1/cashier/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
