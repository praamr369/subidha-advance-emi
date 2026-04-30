from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem
from subscriptions.models import EmiStatus, Payment, PaymentMethod, Product, Subscription
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_payment_collection_finance_account,
    create_product,
    create_subscription,
)


class AdminBiPhase10ApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="bi10_admin", phone="919100002001")
        self.partner = create_partner_user(username="bi10_partner", phone="919100002002")

    def _seed_advance_emi_fixture(self):
        today = timezone.localdate()
        customer = create_customer_profile(name="BI Customer", phone="919100002010")
        product = create_product(product_code="BI10-PROD", name="BI Product", base_price=Decimal("12000.00"))
        batch = create_batch(batch_code="BI10-BATCH", start_date=today.replace(day=1))
        lucky_id = create_lucky_id(batch=batch, lucky_number=7)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
            start_date=today.replace(day=1),
        )
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=today - timedelta(days=10),
            status=EmiStatus.PAID,
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=today - timedelta(days=5),
            status=EmiStatus.PENDING,
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=today,
            status=EmiStatus.WAIVED,
        )
        finance_account = create_payment_collection_finance_account(code="BI10-CASH", name="BI Cash")
        Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=paid_emi,
            amount=Decimal("1000.00"),
            method=PaymentMethod.CASH,
            reference_no="BI10-PAYMENT-001",
            payment_date=today,
            finance_account=finance_account,
            collected_by=self.admin,
        )
        InventoryItem.objects.get_or_create(
            product=product,
            defaults={
                "sku": "BI10-PROD",
                "unit_of_measure": "PCS",
                "opening_stock_qty": Decimal("1.000"),
                "reorder_level_qty": Decimal("2.000"),
            },
        )

    def test_insights_endpoint_is_admin_only_and_empty_safe(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/bi/insights/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["safety"]["read_only"])
        self.assertFalse(response.data["safety"]["financial_mutation_enabled"])
        self.assertFalse(response.data["safety"]["ai_automation_enabled"])
        for key in [
            "profitability",
            "customer_insights",
            "batch_performance",
            "cashflow",
            "inventory_intelligence",
            "hr_costs",
        ]:
            self.assertIn(key, response.data)

        self.client.force_authenticate(self.partner)
        forbidden = self.client.get("/api/v1/admin/bi/insights/")
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_phase10_module_endpoints_are_read_only_and_reflect_operational_data(self):
        self._seed_advance_emi_fixture()
        counts_before = {
            "payments": Payment.objects.count(),
            "subscriptions": Subscription.objects.count(),
            "products": Product.objects.count(),
            "inventory_items": InventoryItem.objects.count(),
        }
        self.client.force_authenticate(self.admin)

        endpoints = [
            "/api/v1/admin/bi/profitability/",
            "/api/v1/admin/bi/customer-insights/",
            "/api/v1/admin/bi/batch-performance/",
            "/api/v1/admin/bi/cashflow/",
            "/api/v1/admin/bi/inventory-intelligence/",
            "/api/v1/admin/bi/hr-costs/",
        ]
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_200_OK, (endpoint, response.data))

        insights = self.client.get("/api/v1/admin/bi/insights/")
        self.assertEqual(insights.status_code, status.HTTP_200_OK, insights.data)
        self.assertEqual(insights.data["profitability"]["summary"]["emi_revenue"], "1000.00")
        self.assertEqual(insights.data["profitability"]["summary"]["emi_waived_amount"], "1000.00")
        self.assertEqual(insights.data["cashflow"]["summary"]["daily_inflow"], "1000.00")
        self.assertGreaterEqual(insights.data["customer_insights"]["summary"]["high_overdue_customers"], 1)
        self.assertGreaterEqual(insights.data["batch_performance"]["summary"]["batch_count"], 1)
        self.assertGreaterEqual(insights.data["inventory_intelligence"]["summary"]["stock_risk_count"], 1)

        self.assertEqual(Payment.objects.count(), counts_before["payments"])
        self.assertEqual(Subscription.objects.count(), counts_before["subscriptions"])
        self.assertEqual(Product.objects.count(), counts_before["products"])
        self.assertEqual(InventoryItem.objects.count(), counts_before["inventory_items"])
