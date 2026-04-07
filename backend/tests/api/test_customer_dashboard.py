from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
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


class CustomerDashboardApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="customer_dashboard_admin",
            phone="9322000001",
        )
        self.customer_user = create_customer_user(
            username="customer_dashboard_user",
            phone="7322000001",
            email="customer-dashboard@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Customer Dashboard",
            phone="7322000001",
        )
        self.product = create_product(
            name="Dashboard Product",
            product_code="DASH-PROD-001",
            base_price=Decimal("3000.00"),
        )

    def _create_winner_subscription(self, *, suffix: str, settled: bool):
        batch = create_batch(
            batch_code=f"CUSDASHWIN{suffix}",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=20),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=40 + int(suffix))
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=20),
        )
        emi_1 = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=4),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=5),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=35),
        )

        if settled:
            record_emi_payment(
                emi_id=emi_1.id,
                amount=Decimal("1000.00"),
                collected_by=self.admin,
                method="CASH",
                reference_no=f"CUSDASHWIN{suffix}-PAY-001",
                payment_date=self.today - timedelta(days=3),
            )

        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )
        subscription.refresh_from_db()
        return subscription

    def test_customer_dashboard_uses_canonical_financial_rollup(self):
        active_batch = create_batch(
            batch_code="CUSDASHACTIVE001",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=30),
        )
        active_lucky_id = create_lucky_id(batch=active_batch, lucky_number=11)
        active_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=active_batch,
            lucky_id=active_lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=30),
        )
        paid_emi = create_emi(
            subscription=active_subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=25),
        )
        create_emi(
            subscription=active_subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=6),
        )
        create_emi(
            subscription=active_subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=7),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="CUSDASH-ACTIVE-PAY-001",
            payment_date=self.today - timedelta(days=24),
        )

        winner_subscription = self._create_winner_subscription(
            suffix="1",
            settled=False,
        )

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        summary = response.data["summary"]
        self.assertEqual(summary["subscription_count"], 2)
        self.assertEqual(summary["active_subscriptions"], 1)
        self.assertEqual(summary["completed_subscriptions"], 0)
        self.assertEqual(summary["winner_subscriptions"], 1)
        self.assertEqual(summary["pending_emis"], 3)
        self.assertEqual(summary["upcoming_emis"], 1)
        self.assertEqual(summary["overdue_emis"], 2)
        self.assertEqual(summary["paid_emis"], 1)
        self.assertEqual(summary["waived_emis"], 2)
        self.assertEqual(summary["total_paid_amount"], "1000.00")
        self.assertEqual(summary["total_pending_amount"], "3000.00")
        self.assertEqual(summary["total_waived_amount"], "2000.00")
        self.assertEqual(summary["remaining_amount"], "3000.00")
        self.assertEqual(summary["outstanding_amount"], "3000.00")
        self.assertEqual(summary["next_due_subscription_id"], active_subscription.id)
        self.assertEqual(summary["next_due_subscription_number"], f"SUB-{active_subscription.id}")
        self.assertEqual(summary["next_due_product_name"], "Dashboard Product")
        self.assertEqual(summary["next_due_amount"], "1000.00")
        self.assertEqual(
            summary["next_due_date"],
            (self.today - timedelta(days=6)).isoformat(),
        )
        self.assertTrue(summary["next_due_is_overdue"])
        self.assertFalse(summary["has_payment_adjustments"])

        rows = {row["id"]: row for row in response.data["subscriptions"]}
        self.assertEqual(
            rows[active_subscription.id]["financial_summary"]["pending_amount"],
            "2000.00",
        )
        self.assertEqual(
            rows[active_subscription.id]["financial_summary"]["remaining_amount"],
            "2000.00",
        )
        self.assertEqual(
            rows[winner_subscription.id]["winner_summary"]["winner_month"],
            1,
        )
        self.assertEqual(
            rows[winner_subscription.id]["winner_summary"]["waived_amount"],
            "2000.00",
        )
        self.assertEqual(
            rows[winner_subscription.id]["financial_summary"]["remaining_amount"],
            "1000.00",
        )

    def test_customer_profile_summary_uses_canonical_dashboard_rollup(self):
        self._create_winner_subscription(suffix="2", settled=True)

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/customer/profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["summary"]["total_subscriptions"], 1)
        self.assertEqual(response.data["summary"]["active_subscriptions"], 0)
        self.assertEqual(response.data["summary"]["won_subscriptions"], 1)
        self.assertEqual(response.data["summary"]["completed_subscriptions"], 1)
        self.assertEqual(response.data["summary"]["pending_emis"], 0)
        self.assertEqual(response.data["summary"]["paid_emis"], 1)
        self.assertEqual(response.data["summary"]["waived_emis"], 2)
        self.assertEqual(response.data["summary"]["total_paid_amount"], "1000.00")

    def test_customer_payment_history_total_paid_ignores_reversed_rows(self):
        batch = create_batch(
            batch_code="CUSDASHPAY001",
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=10),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=15)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("500.00"),
            tenure_months=2,
            start_date=self.today - timedelta(days=10),
        )
        emi_1 = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("600.00"),
            due_date=self.today - timedelta(days=3),
        )
        emi_2 = create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("400.00"),
            due_date=self.today + timedelta(days=12),
        )

        reversed_payment = record_emi_payment(
            emi_id=emi_1.id,
            amount=Decimal("600.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="CUSDASH-PAY-REV-001",
            payment_date=self.today - timedelta(days=2),
        )["payment"]
        record_emi_payment(
            emi_id=emi_2.id,
            amount=Decimal("400.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="CUSDASH-PAY-ACTIVE-001",
            payment_date=self.today - timedelta(days=1),
        )
        reverse_payment_for_admin(
            payment_id=reversed_payment.id,
            reversed_by=self.admin,
            reason="customer dashboard alignment test",
        )

        self.client.force_authenticate(user=self.customer_user)
        payment_response = self.client.get("/api/v1/customer/payments/")
        dashboard_response = self.client.get("/api/v1/customer/dashboard/")

        self.assertEqual(payment_response.status_code, status.HTTP_200_OK, payment_response.data)
        self.assertEqual(payment_response.data["count"], 2)
        self.assertEqual(payment_response.data["total_paid_amount"], "400.00")
        self.assertEqual(payment_response.data["recorded_amount_total"], "1000.00")
        self.assertEqual(payment_response.data["reversed_amount_total"], "600.00")

        self.assertEqual(
            dashboard_response.status_code,
            status.HTTP_200_OK,
            dashboard_response.data,
        )
        self.assertEqual(dashboard_response.data["summary"]["total_paid_amount"], "400.00")
        self.assertEqual(dashboard_response.data["summary"]["remaining_amount"], "600.00")
        self.assertTrue(dashboard_response.data["summary"]["has_payment_adjustments"])
