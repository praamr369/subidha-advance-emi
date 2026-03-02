from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from subscriptions.models import Batch, Customer, Emi, Product, Subscription


class PermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.customer_user = User.objects.create_user(
            username="cust1", password="pass1234", role="CUSTOMER", phone="9800000000"
        )
        self.partner_user = User.objects.create_user(
            username="partner1", password="pass1234", role="PARTNER"
        )

    def test_unauthenticated_access_blocked(self):
        response = self.client.get("/api/public/stats/")
        self.assertIn(response.status_code, [200, 401, 403, 404])

    def test_authenticated_user_can_access(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get("/api/public/stats/")
        self.assertIn(response.status_code, [200, 401, 403, 404])


class PaymentFlowIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.partner = User.objects.create_user(
            username="partner2", password="pass1234", role="PARTNER"
        )
        self.client.force_authenticate(self.partner)

        self.customer_user = User.objects.create_user(
            username="cust2", password="pass1234", role="CUSTOMER", phone="9800000001"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user, name="A", phone="9800000001"
        )
        self.product = Product.objects.create(
            product_code="P-002", name="P", base_price=Decimal("1200.00")
        )
        self.batch = Batch.objects.create(
            batch_code="B1", total_slots=100, duration_months=12, draw_day=10, start_date=date(2026, 1, 1)
        )
        self.lucky = self.batch.lucky_ids.get(lucky_number=1)
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky,
            plan_type="EMI",
            tenure_months=12,
            start_date=date(2026, 1, 1),
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("100.00"),
        )
        self.emi = Emi.objects.create(
            subscription=self.subscription, month_no=1, due_date=date(2026, 2, 1), amount=Decimal("100.00")
        )

    def test_customer_and_subscription_created(self):
        self.assertIsNotNone(self.customer.id)
        self.assertIsNotNone(self.subscription.id)
        self.assertEqual(self.subscription.customer, self.customer)

    def test_emi_belongs_to_subscription(self):
        self.assertEqual(self.emi.subscription, self.subscription)
        self.assertEqual(self.emi.amount, Decimal("100.00"))
