from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from tests.helpers import create_admin_user, create_product


class FeatureBreakAttemptTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="target_admin",
            phone="9999000111",
        )
        self.admin.set_password("StrongAdminPassword123!")
        self.admin.save(update_fields=["password"])
        self.product = create_product(
            name="Stress Test Sofa",
            product_code="STRESS-SOFA-001",
        )

    def test_break_attempt_1_lockout_denial_of_service_neutralized(self):
        """
        ATTACK: An attacker spams 5 failed logins for 'target_admin' from an attacker IP.
        DEFENSE VERIFICATION: The attacker's IP is throttled/blocked, but the genuine admin
        logging in from their own legitimate IP with the correct password is NOT denied service.
        """
        attacker_ip = "198.51.100.99"
        victim_ip = "203.0.113.50"

        # Attacker spams 5 wrong attempts from attacker IP
        for _ in range(5):
            res = self.client.post(
                "/api/v1/auth/login/",
                {"identifier": "target_admin", "password": "WrongAttackerGuess"},
                format="json",
                HTTP_X_FORWARDED_FOR=attacker_ip,
                REMOTE_ADDR=attacker_ip,
            )
            self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_429_TOO_MANY_REQUESTS])

        # Attacker trying a 6th time is blocked with 429
        attacker_blocked = self.client.post(
            "/api/v1/auth/login/",
            {"identifier": "target_admin", "password": "WrongAttackerGuess"},
            format="json",
            HTTP_X_FORWARDED_FOR=attacker_ip,
            REMOTE_ADDR=attacker_ip,
        )
        self.assertEqual(attacker_blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # Legitimate admin logs in with correct credentials from their legitimate IP
        legitimate_login = self.client.post(
            "/api/v1/auth/login/",
            {"identifier": "target_admin", "password": "StrongAdminPassword123!"},
            format="json",
            HTTP_X_FORWARDED_FOR=victim_ip,
            REMOTE_ADDR=victim_ip,
        )
        self.assertEqual(legitimate_login.status_code, status.HTTP_200_OK)
        self.assertIn("access", legitimate_login.data)
        self.assertIn("refresh", legitimate_login.data)

    def test_break_attempt_2_oversized_session_id_handled_safely(self):
        """
        ATTACK: Attacker sends session_id with > 64 chars in public lead.
        DEFENSE VERIFICATION: Serializer rejects oversized session_id cleanly with 400 Bad Request,
        preventing unhandled Postgres DataError / varchar(64) crash.
        """
        oversized_session = "a" * 150
        res = self.client.post(
            "/api/v1/public/leads/",
            {
                "name": "Test User",
                "phone": "9999888877",
                "session_id": oversized_session,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("session_id", res.data)

    def test_break_attempt_3_authenticated_user_multiple_votes_stuffing_blocked(self):
        """
        ATTACK: Same logged-in user casts multiple votes by sending different session_ids.
        DEFENSE VERIFICATION: The system links the reaction to the authenticated User instance.
        Repeated votes update the user's single reaction; no duplicate reaction records are created.
        """
        self.client.force_authenticate(user=self.admin)

        for i in range(5):
            res = self.client.post(
                f"/api/v1/public/products/{self.product.id}/react/",
                {
                    "session_id": f"spoofed-session-{i}",
                    "is_like": True,
                },
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        from crm.models import ProductReaction
        user_reaction_count = ProductReaction.objects.filter(
            product=self.product,
            user=self.admin,
        ).count()
        # Exactly ONE vote must exist for this user, despite 5 different session IDs
        self.assertEqual(user_reaction_count, 1)

    def test_break_attempt_4_n_plus_one_query_explosion_eliminated(self):
        """
        ATTACK/STRESS: Query product performance across 20 products.
        DEFENSE VERIFICATION: Instead of running 5 queries per product (100+ queries),
        bulk aggregation executes in <= 10 constant queries.
        """
        for i in range(20):
            create_product(name=f"Scale Sofa {i}", product_code=f"SCALE-{i:03d}")

        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        from crm.services.crm_analytics_service import get_product_performance

        with CaptureQueriesContext(connection) as ctx:
            data = get_product_performance(days=30)

        query_count = len(ctx.captured_queries)
        # Should be <= 10 constant bulk queries, never 80-100+
        self.assertLessEqual(query_count, 10)
        self.assertGreaterEqual(len(data), 20)
