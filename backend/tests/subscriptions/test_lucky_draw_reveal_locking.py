"""
Lucky draw reveal: PostgreSQL-safe row locking and API behavior.

Regression: select_for_update() combined with nullable select_related() OUTER JOINs
raised NotSupportedError on PostgreSQL ("FOR UPDATE cannot be applied to the nullable
side of an outer join").
"""

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils.crypto import get_random_string
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog, LuckyDraw, LuckyId, LuckyIdStatus
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_product,
    create_subscription,
)


class LuckyDrawRevealLockingTests(TestCase):
    def _seed_open_batch_with_lucky_ids(self, *, batch_code: str, product_code: str):
        """OPEN batches must have total_slots=100 per Batch.clean(); LuckyId rows 0–99 are created by signals."""
        batch = create_batch(
            batch_code=batch_code,
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        product = create_product(
            name="Locking Draw Product",
            product_code=product_code,
            base_price=Decimal("3000.00"),
        )
        customer = create_customer_profile(
            name="Locking Draw Customer",
            phone=f"91{get_random_string(9, '0123456789')}",
        )
        lucky = LuckyId.objects.get(batch=batch, lucky_number=7)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        for month_no in (1, 2, 3):
            create_emi(
                subscription=subscription,
                month_no=month_no,
                amount=Decimal("1000.00"),
                due_date=date(2026, 2 + month_no, 10),
            )
        return batch, subscription, lucky

    def test_reveal_succeeds_and_sets_winner(self):
        batch, subscription, _lucky = self._seed_open_batch_with_lucky_ids(
            batch_code=f"LD-LK-{get_random_string(5)}",
            product_code=f"LD-LK-P-{get_random_string(5)}",
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)

        result = reveal_and_execute_draw(draw_id=draw.id, revealed_seed=secret_seed)

        self.assertTrue(result["is_revealed"])
        self.assertEqual(result["winner_subscription_id"], subscription.id)

        draw.refresh_from_db()
        self.assertTrue(draw.is_revealed)
        self.assertEqual(draw.winner_subscription_id, subscription.id)

    def test_invalid_reveal_seed_raises_validation_error(self):
        batch, _sub, _lucky = self._seed_open_batch_with_lucky_ids(
            batch_code=f"LD-IV-{get_random_string(5)}",
            product_code=f"LD-IV-P-{get_random_string(5)}",
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        self.assertTrue(secret_seed)

        with self.assertRaises(ValidationError):
            reveal_and_execute_draw(draw_id=draw.id, revealed_seed="not-the-secret-seed")

    def test_reveal_idempotent_returns_same_winner_without_duplicate_reveal_audit(self):
        batch, subscription, _lucky = self._seed_open_batch_with_lucky_ids(
            batch_code=f"LD-ID-{get_random_string(5)}",
            product_code=f"LD-ID-P-{get_random_string(5)}",
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)

        reveal_and_execute_draw(draw_id=draw.id, revealed_seed=secret_seed)

        action = getattr(AuditLog.ActionType, "DRAW_REVEALED", AuditLog.ActionType.DRAW_EXECUTED)
        first_count = AuditLog.objects.filter(
            model_name="LuckyDraw",
            object_id=draw.id,
            action_type=action,
        ).count()
        self.assertGreaterEqual(first_count, 1)

        again = reveal_and_execute_draw(draw_id=draw.id, revealed_seed=secret_seed)
        self.assertEqual(again["winner_subscription_id"], subscription.id)

        second_count = AuditLog.objects.filter(
            model_name="LuckyDraw",
            object_id=draw.id,
            action_type=action,
        ).count()
        self.assertEqual(second_count, first_count)

    def test_postgresql_reveal_query_locks_draw_self_only(self):
        if connection.vendor != "postgresql":
            self.skipTest("PostgreSQL-specific FOR UPDATE OF self assertion")

        batch, _sub, _lucky = self._seed_open_batch_with_lucky_ids(
            batch_code=f"LD-PG-{get_random_string(5)}",
            product_code=f"LD-PG-P-{get_random_string(5)}",
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)

        with CaptureQueriesContext(connection) as ctx:
            reveal_and_execute_draw(draw_id=draw.id, revealed_seed=secret_seed)

        joined = " ".join(q["sql"] for q in ctx.captured_queries).upper()
        self.assertIn("FOR UPDATE", joined)


class LuckyDrawRevealApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ld_reveal_api", phone="9100000888")
        self.client.force_authenticate(self.admin)

    def _minimal_draw(self):
        batch = create_batch(
            batch_code=f"LD-API-{get_random_string(5)}",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        product = create_product(
            name="API Draw Product",
            product_code=f"LD-API-P-{get_random_string(5)}",
            base_price=Decimal("3000.00"),
        )
        customer = create_customer_profile(
            name="API Draw Customer",
            phone=f"91{get_random_string(9, '0123456789')}",
        )
        lucky = LuckyId.objects.get(batch=batch, lucky_number=3)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        for month_no in (1, 2, 3):
            create_emi(
                subscription=subscription,
                month_no=month_no,
                amount=Decimal("1000.00"),
                due_date=date(2026, 2 + month_no, 10),
            )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        return draw, secret_seed

    def test_reveal_invalid_seed_returns_400(self):
        draw, secret_seed = self._minimal_draw()
        self.assertTrue(secret_seed)

        response = self.client.post(
            f"/api/v1/admin/lucky-draws/{draw.id}/reveal/",
            {"revealed_seed": "wrong-seed-value"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_reveal_unknown_draw_returns_404(self):
        response = self.client.post(
            "/api/v1/admin/lucky-draws/999999991/reveal/",
            {"revealed_seed": "any"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_reveal_success_returns_200(self):
        draw, secret_seed = self._minimal_draw()
        response = self.client.post(
            f"/api/v1/admin/lucky-draws/{draw.id}/reveal/",
            {"revealed_seed": secret_seed},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data.get("is_revealed"))
