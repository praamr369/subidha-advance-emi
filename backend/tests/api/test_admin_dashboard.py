from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)
from subscriptions.services.payment_service import record_emi_payment


class AdminDashboardApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = create_admin_user(
            username="admin_dashboard_ops",
            phone="9304000001",
        )
        self.client.force_authenticate(user=self.admin)

        customer = create_customer_profile(
            name="Dashboard Customer",
            phone="7304000001",
        )
        product = create_product(
            name="Dashboard Product",
            product_code="DASH-001",
            base_price=Decimal("3600.00"),
        )
        batch = create_batch(
            batch_code="DASHAPR2026",
            duration_months=6,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
            status="OPEN",
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=8)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=None,
            total_amount=Decimal("3600.00"),
            monthly_amount=Decimal("600.00"),
            tenure_months=6,
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("600.00"),
            due_date=timezone.localdate(),
        )

        record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("600.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DASH-API-001",
            payment_date=timezone.localdate(),
        )

    def test_admin_dashboard_includes_operations_and_recent_activity(self):
        response = self.client.get("/api/v1/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("collections", response.data)
        self.assertIn("operations", response.data)
        self.assertIn("recent_activity", response.data)
        self.assertIn("next_draw_batch", response.data["batches"])

        self.assertEqual(response.data["collections"]["today_transaction_count"], 1)
        self.assertEqual(response.data["collections"]["today_active_payments"], 1)
        self.assertEqual(response.data["collections"]["today_reversed_payments"], 0)
        self.assertEqual(len(response.data["recent_activity"]), 1)
        self.assertEqual(response.data["recent_activity"][0]["kind"], "PAYMENT")
        self.assertTrue(
            str(response.data["recent_activity"][0]["subscription_number"]).startswith(
                "SUB-"
            )
        )
        self.assertEqual(response.data["operations"]["open_batches"], 1)
