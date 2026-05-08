from datetime import date
from decimal import Decimal

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
    create_partner_user,
    create_product,
    create_subscription,
)


class AdminSubscriptionDetailApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_subscription_detail",
            phone="9303000001",
        )
        self.client.force_authenticate(user=self.admin)

        self.partner = create_partner_user(
            username="partner_subscription_detail",
            phone="9303000002",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Admin Subscription Customer",
            phone="7303000001",
        )
        self.product = create_product(
            name="Admin Subscription Product",
            product_code="SUB-API-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="SUBAPI2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=41)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        self.emi_1 = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 10),
        )
        self.emi_2 = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 10),
        )
        self.emi_3 = create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 10),
        )
        self.url = f"/api/v1/admin/subscriptions/{self.subscription.id}/"

    def test_admin_subscription_detail_returns_canonical_finance_fields(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUB-API-PAY-001",
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("financial_summary", response.data)
        self.assertIn("reconciliation_flags", response.data)
        self.assertIn("winner_summary", response.data)
        self.assertIn("winner_status", response.data)
        self.assertIn("emis", response.data)

        summary = response.data["financial_summary"]
        flags = response.data["reconciliation_flags"]

        self.assertEqual(summary["paid_amount"], "1000.00")
        self.assertEqual(summary["pending_amount"], "2000.00")
        self.assertEqual(summary["remaining_amount"], "2000.00")
        self.assertEqual(summary["reversed_amount"], "0.00")
        self.assertEqual(summary["waived_amount"], "0.00")
        self.assertEqual(summary["total_emi_amount"], "3000.00")
        self.assertTrue(flags["is_financially_consistent"])
        self.assertTrue(flags["pending_matches_remaining"])
        self.assertEqual(flags["warnings"], [])
        self.assertEqual(len(response.data["emis"]), 3)

    def test_admin_subscription_detail_exposes_winner_and_waived_rows(self):
        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(response.data["financial_summary"]["waived_amount"], "2000.00")
        self.assertEqual(response.data["financial_summary"]["pending_amount"], "1000.00")
        self.assertEqual(response.data["financial_summary"]["remaining_amount"], "1000.00")
        self.assertTrue(response.data["reconciliation_flags"]["has_waiver_history"])

        waived_rows = [row for row in response.data["emis"] if row["status"] == "WAIVED"]
        self.assertEqual(len(waived_rows), 2)
        self.assertTrue(all(row["month_no"] > 1 for row in waived_rows))

    def test_admin_subscription_detail_preserves_completed_winner_without_false_warning(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUB-API-PAY-002",
        )

        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(response.data["financial_summary"]["remaining_amount"], "0.00")
        self.assertEqual(response.data["financial_summary"]["waived_amount"], "2000.00")
        self.assertEqual(self.lucky_id.status, "WON")
        self.assertNotIn(
            "Winner subscription is fully settled, but subscription status is not COMPLETED.",
            response.data["reconciliation_flags"]["warnings"],
        )
        self.assertNotIn(
            "Winner subscription has unresolved EMI state, but subscription status is not WON.",
            response.data["reconciliation_flags"]["warnings"],
        )

    def test_admin_subscription_detail_auto_repairs_completed_winner_lucky_id_drift(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUB-API-PAY-003",
        )

        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        self.subscription.refresh_from_db()
        self.lucky_id.status = "ASSIGNED"
        self.lucky_id.save(update_fields=["status"])
        self.lucky_id.refresh_from_db()
        self.assertEqual(self.subscription.status, "COMPLETED")
        self.assertEqual(self.lucky_id.status, "ASSIGNED")

        response = self.client.get(self.url)
        self.lucky_id.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(self.lucky_id.status, "WON")
        self.assertNotIn(
            "Winner markers exist, but Lucky ID status is not WON.",
            response.data["reconciliation_flags"]["warnings"],
        )

    def test_admin_subscription_detail_auto_repairs_unsettled_winner_drift(self):
        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        self.subscription.status = "COMPLETED"
        self.subscription.save(update_fields=["status"])
        self.lucky_id.status = "ASSIGNED"
        self.lucky_id.save(update_fields=["status"])
        self.lucky_id.refresh_from_db()
        self.assertEqual(self.lucky_id.status, "ASSIGNED")

        response = self.client.get(self.url)
        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "WON")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(self.subscription.status, "WON")
        self.assertEqual(self.lucky_id.status, "WON")
        self.assertNotIn(
            "Winner subscription has unresolved EMI state, but subscription status is not WON.",
            response.data["reconciliation_flags"]["warnings"],
        )
        self.assertNotIn(
            "Winner markers exist, but Lucky ID status is not WON.",
            response.data["reconciliation_flags"]["warnings"],
        )

    def test_subscription_create_returns_clean_error_for_frozen_lucky_id(self):
        self.batch.status = "LOCKED"
        self.batch.save(update_fields=["status"])
        self.lucky_id.status = "AVAILABLE"
        self.lucky_id.save(update_fields=["status"])

        payload = {
            "customer": self.customer.id,
            "product": self.product.id,
            "partner": self.partner.id,
            "plan_type": "EMI",
            "tenure_months": self.batch.duration_months,
            "start_date": "2026-03-01",
            "batch": self.batch.id,
            "lucky_id": self.lucky_id.id,
        }
        response = self.client.post("/api/v1/admin/subscriptions/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lucky_id", response.data)
        self.assertNotIn("uq_subscription_per_lucky_id", str(response.data))
