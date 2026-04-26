from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Payment, PaymentMethod
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class Phase4FinanceWorkflowApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="p4_admin", phone="9000001101")
        self.cashier = create_cashier_user(username="p4_cashier", phone="9000001102")
        self.partner = create_partner_user(username="p4_partner", phone="9000001103")
        self.customer = create_customer_profile(name="Phase4 Customer", phone="9000001104")

        self.product = create_product(name="Phase4 Product", product_code="P4-PROD-001")
        self.batch = create_batch(batch_code="P4-BATCH-OPEN")
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1000.00"),
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=timezone.localdate() - timedelta(days=5),
        )
        Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            payment_date=timezone.localdate(),
            collected_by=self.cashier,
            reference_no=f"P4-REF-{timezone.now().timestamp():.0f}",
        )

    def test_admin_finance_dashboard_endpoint_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/finance/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("cards", response.data)
        self.assertIn("today_total_collection", response.data["cards"])

    def test_admin_finance_dashboard_for_partner_forbidden(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/finance/dashboard/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_finance_endpoints_are_customer_scoped(self):
        self.client.force_authenticate(user=self.customer.user)

        summary = self.client.get("/api/v1/customer/finance/summary/")
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["customer_id"], self.customer.id)

        invoices = self.client.get("/api/v1/customer/invoices/")
        self.assertEqual(invoices.status_code, status.HTTP_200_OK)
        self.assertIn("count", invoices.data)
        self.assertIn("results", invoices.data)

        statement = self.client.get("/api/v1/customer/account-statement/")
        self.assertEqual(statement.status_code, status.HTTP_200_OK)
        self.assertIn("summary", statement.data)

    def test_partner_finance_endpoints_are_partner_scoped(self):
        self.client.force_authenticate(user=self.partner)

        summary = self.client.get("/api/v1/partner/finance/summary/")
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertIn("summary", summary.data)

        payments = self.client.get("/api/v1/partner/linked-customer-payments/")
        self.assertEqual(payments.status_code, status.HTTP_200_OK)
        self.assertIn("results", payments.data)

        receipts = self.client.get("/api/v1/partner/receipts/")
        self.assertEqual(receipts.status_code, status.HTTP_200_OK)
        self.assertIn("results", receipts.data)

    def test_customer_cannot_access_admin_statement_endpoint(self):
        self.client.force_authenticate(user=self.customer.user)
        response = self.client.get(f"/api/v1/admin/customer/{self.customer.id}/statement/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
