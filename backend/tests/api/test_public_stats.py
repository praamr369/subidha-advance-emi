from datetime import date
from decimal import Decimal

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class PublicStatsApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = create_admin_user(
            username="public_stats_admin",
            phone="9317000001",
        )

        customer = create_customer_profile(
            name="Public Stats Winner",
            phone="7317000001",
        )
        product = create_product(
            name="Public Stats Product",
            product_code="PUBLIC-STATS-001",
            base_price=Decimal("3000.00"),
        )
        batch = create_batch(
            batch_code="PUBLICSTATS2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 4, 1),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=71)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 4, 1),
        )
        winner_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 10),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 6, 10),
        )

        record_emi_payment(
            emi_id=winner_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="PUBLIC-STATS-PAY-001",
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

    def test_public_stats_counts_completed_winner_in_total_winners(self):
        response = self.client.get("/api/v1/public/stats/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["total_winners"], 1)
