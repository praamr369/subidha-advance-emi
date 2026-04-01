from datetime import date
from decimal import Decimal

from django.test import TestCase

from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
from subscriptions.services.subscription_financial_service import (
    build_subscription_financial_snapshot,
    get_subscription_detail_queryset,
)
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


class SubscriptionFinancialServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="subscription_finance_admin",
            phone="9302000001",
        )
        self.partner = create_partner_user(
            username="subscription_finance_partner",
            phone="9302000002",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Subscription Finance Customer",
            phone="7302000001",
        )
        self.product = create_product(
            name="Subscription Finance Product",
            product_code="SUB-FIN-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="SUBFIN2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=31)
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

    def _snapshot(self):
        subscription = get_subscription_detail_queryset().get(pk=self.subscription.pk)
        return build_subscription_financial_snapshot(subscription)

    def test_summary_matches_normal_paid_flow(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUB-FIN-PAY-001",
        )

        snapshot = self._snapshot()

        self.assertEqual(snapshot["paid_amount"], "1000.00")
        self.assertEqual(snapshot["waived_amount"], "0.00")
        self.assertEqual(snapshot["reversed_amount"], "0.00")
        self.assertEqual(snapshot["pending_amount"], "2000.00")
        self.assertEqual(snapshot["remaining_amount"], "2000.00")
        self.assertEqual(snapshot["emi_count_total"], 3)
        self.assertEqual(snapshot["emi_count_paid"], 1)
        self.assertEqual(snapshot["emi_count_waived"], 0)
        self.assertEqual(snapshot["emi_count_pending"], 2)
        self.assertTrue(snapshot["pending_matches_remaining"])
        self.assertTrue(snapshot["is_financially_consistent"])
        self.assertEqual(snapshot["warnings"], [])

    def test_summary_stays_aligned_after_reversal(self):
        payment = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SUB-FIN-PAY-002",
        )["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="subscription detail reversal",
        )

        snapshot = self._snapshot()

        self.assertEqual(snapshot["paid_amount"], "0.00")
        self.assertEqual(snapshot["reversed_amount"], "1000.00")
        self.assertEqual(snapshot["pending_amount"], "3000.00")
        self.assertEqual(snapshot["remaining_amount"], "3000.00")
        self.assertTrue(snapshot["pending_matches_remaining"])
        self.assertTrue(snapshot["has_reversal_history"])
        self.assertTrue(snapshot["is_financially_consistent"])

    def test_winner_future_waiver_is_visible_and_excluded_from_pending(self):
        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )
        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        snapshot = self._snapshot()

        self.assertEqual(self.subscription.status, "WON")
        self.assertEqual(self.lucky_id.status, "WON")
        self.assertEqual(snapshot["winner_status"], "WON")
        self.assertEqual(snapshot["winner_month"], 1)
        self.assertEqual(snapshot["waived_amount"], "2000.00")
        self.assertEqual(snapshot["pending_amount"], "1000.00")
        self.assertEqual(snapshot["remaining_amount"], "1000.00")
        self.assertEqual(snapshot["emi_count_waived"], 2)
        self.assertEqual(snapshot["emi_count_pending"], 1)
        self.assertTrue(snapshot["has_waiver_history"])
        self.assertTrue(snapshot["pending_matches_remaining"])
        self.assertTrue(snapshot["is_financially_consistent"])

        waived_rows = [row for row in snapshot["emis"] if row["status"] == "WAIVED"]
        self.assertEqual(len(waived_rows), 2)
        self.assertTrue(all(row["month_no"] > 1 for row in waived_rows))
