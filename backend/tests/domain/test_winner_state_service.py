from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from subscriptions.models import AuditLog, LuckyIdStatus, SubscriptionStatus
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.winner_state_service import winner_history_q
from subscriptions.services.winner_service import WinnerService
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class WinnerStateServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="winner_state_admin",
            phone="9306100001",
        )
        self.customer = create_customer_profile(
            name="Winner State Customer",
            phone="7306100001",
        )
        self.product = create_product(
            name="Winner State Product",
            product_code="WINNER-STATE-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="WINSTATE2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=22)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        self.emi_1 = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 10),
            status="PAID",
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

    def test_draw_reveal_completes_fully_settled_winner_and_marks_lucky_id_won(self):
        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)

        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        self.assertEqual(self.subscription.status, SubscriptionStatus.COMPLETED)
        self.assertEqual(self.subscription.winner_month, 1)
        self.assertEqual(self.lucky_id.status, LuckyIdStatus.WON)

    def test_manual_winner_service_completes_fully_settled_winner_and_marks_lucky_id_won(self):
        result = WinnerService.execute_winner(
            subscription_id=self.subscription.id,
            winner_month=1,
            performed_by=self.admin,
        )

        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        self.assertEqual(self.subscription.status, SubscriptionStatus.COMPLETED)
        self.assertEqual(self.subscription.winner_month, 1)
        self.assertEqual(self.subscription.waived_amount, Decimal("2000.00"))
        self.assertEqual(self.lucky_id.status, LuckyIdStatus.WON)
        self.assertEqual(result["subscription_status"], SubscriptionStatus.COMPLETED)
        self.assertEqual(result["lucky_id_status"], LuckyIdStatus.WON)

    def test_sync_winner_states_repairs_completed_winner_lucky_id_and_is_rerunnable(self):
        self.subscription.status = SubscriptionStatus.COMPLETED
        self.subscription.winner_month = 1
        self.subscription.waived_amount = Decimal("2000.00")
        self.subscription.save(update_fields=["status", "winner_month", "waived_amount"])

        self.emi_2.status = "WAIVED"
        self.emi_2.save(update_fields=["status"])
        self.emi_3.status = "WAIVED"
        self.emi_3.save(update_fields=["status"])

        self.lucky_id.status = LuckyIdStatus.ASSIGNED
        self.lucky_id.save(update_fields=["status"])

        out = StringIO()
        call_command(
            "sync_winner_states",
            "--subscription-id",
            str(self.subscription.id),
            "--dry-run",
            stdout=out,
        )
        self.assertIn("Would sync subscription", out.getvalue())
        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()
        self.assertEqual(self.subscription.status, SubscriptionStatus.COMPLETED)
        self.assertEqual(self.lucky_id.status, LuckyIdStatus.ASSIGNED)

        out = StringIO()
        call_command("sync_winner_states", stdout=out)
        self.subscription.refresh_from_db()
        self.lucky_id.refresh_from_db()

        self.assertEqual(self.subscription.status, SubscriptionStatus.COMPLETED)
        self.assertEqual(self.lucky_id.status, LuckyIdStatus.WON)
        self.assertEqual(
            AuditLog.objects.filter(action_type=AuditLog.ActionType.WINNER_STATE_SYNCED).count(),
            2,
        )

        out = StringIO()
        call_command("sync_winner_states", stdout=out)
        self.assertIn("changed=0", out.getvalue())
        self.assertEqual(
            AuditLog.objects.filter(action_type=AuditLog.ActionType.WINNER_STATE_SYNCED).count(),
            2,
        )

    def test_winner_history_filter_includes_completed_winner_rows(self):
        self.subscription.status = SubscriptionStatus.COMPLETED
        self.subscription.winner_month = 1
        self.subscription.waived_amount = Decimal("2000.00")
        self.subscription.save(update_fields=["status", "winner_month", "waived_amount"])
        self.lucky_id.status = LuckyIdStatus.WON
        self.lucky_id.save(update_fields=["status"])

        self.assertEqual(
            self.subscription.__class__.objects.filter(winner_history_q()).distinct().count(),
            1,
        )
