from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import AuditLog
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


class LuckyDrawPublicTrustApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="ld_public_admin", phone="9311000001")
        self.customer_user = create_customer_user(
            username="ld_public_customer",
            phone="9311000002",
            email="ld-public-customer@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Rahim Karim",
            phone="9311000002",
            email="ld-public-customer@example.com",
        )

        self.batch = create_batch(
            batch_code="LD-PUBLIC-001",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.product = create_product(
            name="Public Trust Sofa",
            product_code="LD-PUBLIC-PROD-001",
            base_price=Decimal("3000.00"),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=7)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=date(2026, 3, 1),
        )
        for month_no in (1, 2, 3):
            create_emi(
                subscription=self.subscription,
                month_no=month_no,
                amount=Decimal("1000.00"),
                due_date=date(2026, 2 + month_no, 10),
            )

        self.draw, self.secret_seed = create_lucky_draw_commit(batch=self.batch)

    def test_public_certificate_exposes_commit_hash_before_reveal_without_pii(self):
        response = self.client.get(f"/api/v1/public/lucky-draws/{self.draw.id}/certificate/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        certificate = response.data["certificate"]
        self.assertEqual(certificate["public_commit_hash"], self.draw.committed_hash)
        self.assertIsNotNone(certificate["commitment_published_at"])
        self.assertIn("sealed envelope", certificate["public_explanation"].lower())
        self.assertEqual(certificate["eligible_snapshot_count"], 0)

        for forbidden_key in (
            "customer_name",
            "customer_phone",
            "phone",
            "aadhaar",
            "kyc",
            "winner_subscription_id",
            "winner_lucky_id",
            "subscription_id",
        ):
            self.assertNotIn(forbidden_key, certificate)

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DRAW_CERTIFICATE_PUBLISHED,
                model_name="LuckyDraw",
                object_id=self.draw.id,
            ).exists()
        )

    def test_public_verification_hides_seed_before_reveal_and_exposes_it_after_reveal(self):
        before = self.client.get(f"/api/v1/public/lucky-draws/{self.draw.id}/verification/")
        self.assertEqual(before.status_code, status.HTTP_200_OK, before.data)
        verification = before.data["verification"]
        self.assertIsNone(verification["revealed_seed"])
        self.assertEqual(verification["verification_status"], "pending_reveal")

        reveal_and_execute_draw(draw_id=self.draw.id, revealed_seed=self.secret_seed, performed_by=self.admin)

        after = self.client.get(f"/api/v1/public/lucky-draws/{self.draw.id}/verification/")
        self.assertEqual(after.status_code, status.HTTP_200_OK, after.data)
        verification = after.data["verification"]
        self.assertEqual(verification["revealed_seed"], self.secret_seed)
        self.assertTrue(verification["hash_matches"])
        self.assertEqual(verification["verification_status"], "verified")

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DRAW_PUBLIC_VERIFIED,
                model_name="LuckyDraw",
                object_id=self.draw.id,
            ).exists()
        )

    def test_public_winner_detail_remains_masked_and_future_only(self):
        reveal_and_execute_draw(draw_id=self.draw.id, revealed_seed=self.secret_seed, performed_by=self.admin)

        response = self.client.get(f"/api/v1/public/lucky-draws/{self.draw.id}/winner/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        winner = response.data["winner"]

        self.assertTrue("*" in (winner.get("winner_name_masked") or ""))
        self.assertEqual(winner["waiver_scope"], "FUTURE_EMI_ONLY")
        self.assertEqual(winner["waived_emi_count"], 2)
        self.assertIn("future emi waiver only", winner["winner_benefit_note"].lower())

        for forbidden_key in (
            "customer_name",
            "customer_phone",
            "phone",
            "aadhaar",
            "kyc",
            "winner_subscription_id",
            "winner_lucky_id",
            "subscription_id",
        ):
            self.assertNotIn(forbidden_key, winner)

        self.assertTrue(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.DRAW_PUBLIC_RESULT_PUBLISHED,
                model_name="LuckyDraw",
                object_id=self.draw.id,
            ).exists()
        )

    def test_legacy_draw_data_serializes_safely(self):
        reveal_and_execute_draw(draw_id=self.draw.id, revealed_seed=self.secret_seed, performed_by=self.admin)

        response = self.client.get("/api/v1/public/winners/?limit=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = response.data["results"][0]

        self.assertEqual(row["verification_status"], "legacy")
        self.assertEqual(row["public_commit_hash"], self.draw.committed_hash)
        self.assertIn("winner_name_masked", row)
        self.assertTrue("*" in (row.get("winner_name_masked") or ""))

    def test_anonymous_users_cannot_call_admin_draw_actions(self):
        commit_response = self.client.post(
            f"/api/v1/admin/batches/{self.batch.id}/commit-draw/",
            format="json",
        )
        self.assertIn(commit_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.client.force_authenticate(user=self.customer_user)
        reveal_response = self.client.post(
            f"/api/v1/admin/lucky-draws/{self.draw.id}/reveal/",
            {"revealed_seed": self.secret_seed},
            format="json",
        )
        self.assertIn(reveal_response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
