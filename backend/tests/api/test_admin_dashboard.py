from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
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

    def test_admin_dashboard_counts_completed_winner_in_won_subscriptions(self):
        winner_user = create_customer_user(
            username="dashboard_winner_customer",
            phone="7304000002",
        )
        winner_customer = create_customer_profile(
            user=winner_user,
            name="Dashboard Winner Customer",
            phone="7304000002",
        )
        winner_product = create_product(
            name="Dashboard Winner Product",
            product_code="DASH-WIN-001",
            base_price=Decimal("3000.00"),
        )
        winner_batch = create_batch(
            batch_code="DASHWIN2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
            status="OPEN",
        )
        winner_lucky_id = create_lucky_id(batch=winner_batch, lucky_number=18)
        winner_subscription = create_subscription(
            customer=winner_customer,
            product=winner_product,
            batch=winner_batch,
            lucky_id=winner_lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 4, 1),
        )
        winner_emi = create_emi(
            subscription=winner_subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=winner_subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 10),
        )
        create_emi(
            subscription=winner_subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 6, 10),
        )
        record_emi_payment(
            emi_id=winner_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DASH-WIN-PAY-001",
            payment_date=date(2026, 4, 10),
        )
        draw, secret_seed = create_lucky_draw_commit(batch=winner_batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        response = self.client.get("/api/v1/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["subscriptions"]["won"], 1)
