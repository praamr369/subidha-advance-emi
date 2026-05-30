from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import reverse_payment_for_admin
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.models import SubscriptionStatus


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
        self.subscription = subscription
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
        self.assertEqual(response.data["collections"]["today_active_transaction_count"], 1)
        self.assertEqual(response.data["collections"]["today_reversed_transaction_count"], 0)
        self.assertEqual(response.data["collections"]["today_gross_amount"], "600.00")
        self.assertEqual(response.data["collections"]["today_reversed_amount"], "0.00")
        self.assertEqual(response.data["collections"]["today_net_amount"], "600.00")
        self.assertEqual(len(response.data["recent_activity"]), 1)
        self.assertEqual(response.data["recent_activity"][0]["kind"], "PAYMENT")
        self.assertTrue(
            str(response.data["recent_activity"][0]["subscription_number"]).startswith(
                "SUB-"
            )
        )
        self.assertEqual(response.data["operations"]["open_batches"], 1)

    def test_admin_dashboard_exposes_gross_reversed_and_net_collection_split(self):
        customer = create_customer_profile(
            user=create_customer_user(
                username="dashboard_split_customer",
                phone="7304000009",
            ),
            name="Dashboard Split Customer",
            phone="7304000009",
        )
        product = create_product(
            name="Dashboard Split Product",
            product_code="DASH-SPLIT-001",
            base_price=Decimal("1000.00"),
        )
        batch = create_batch(
            batch_code="DASHSPLIT2026",
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
            status="OPEN",
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=9)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("500.00"),
            tenure_months=2,
        )
        extra_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("400.00"),
            due_date=timezone.localdate(),
        )
        extra_payment = record_emi_payment(
            emi_id=extra_emi.id,
            amount=Decimal("400.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DASH-API-002",
            payment_date=timezone.localdate(),
        )["payment"]
        reverse_payment_for_admin(
            payment_id=extra_payment.id,
            reversed_by=self.admin,
            reason="admin dashboard regression test",
        )

        response = self.client.get("/api/v1/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["collections"]["today_transaction_count"], 2)
        self.assertEqual(response.data["collections"]["today_active_transaction_count"], 1)
        self.assertEqual(response.data["collections"]["today_reversed_transaction_count"], 1)
        self.assertEqual(response.data["collections"]["today_gross_amount"], "1000.00")
        self.assertEqual(response.data["collections"]["today_reversed_amount"], "400.00")
        self.assertEqual(response.data["collections"]["today_net_amount"], "600.00")

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

    def test_admin_dashboard_requires_admin_role(self):
        customer_user = create_customer_user(
            username="dashboard_non_admin",
            phone="7304000099",
        )
        self.client.force_authenticate(user=customer_user)

        response = self.client.get("/api/v1/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancelled_subscription_is_excluded_from_operational_dashboard_kpis(self):
        cancelled_customer = create_customer_profile(
            user=create_customer_user(
                username="dashboard_cancelled_customer",
                phone="7304000010",
            ),
            name="Cancelled Ops Customer",
            phone="7304000010",
        )
        cancelled_product = create_product(
            name="Cancelled Ops Product",
            product_code="DASH-CAN-001",
            base_price=Decimal("1200.00"),
        )
        cancelled_batch = create_batch(
            batch_code="DASHCAN2026",
            duration_months=6,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
            status="OPEN",
        )
        cancelled_lucky_id = create_lucky_id(batch=cancelled_batch, lucky_number=30)
        cancelled_subscription = create_subscription(
            customer=cancelled_customer,
            product=cancelled_product,
            batch=cancelled_batch,
            lucky_id=cancelled_lucky_id,
            total_amount=Decimal("1200.00"),
            monthly_amount=Decimal("200.00"),
            tenure_months=6,
        )
        cancelled_subscription.status = SubscriptionStatus.CANCELLED
        cancelled_subscription.save(update_fields=["status"])
        create_emi(
            subscription=cancelled_subscription,
            month_no=1,
            amount=Decimal("200.00"),
            due_date=timezone.localdate() - timedelta(days=5),
        )

        response = self.client.get("/api/v1/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        due_ids = {row["subscription_id"] for row in response.data.get("due_subscriptions", [])}
        self.assertNotIn(cancelled_subscription.id, due_ids)
