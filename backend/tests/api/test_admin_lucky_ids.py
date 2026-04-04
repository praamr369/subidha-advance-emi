from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
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
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class AdminLuckyIdReportingTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_lucky_id_reporting",
            phone="9306200001",
        )
        self.client.force_authenticate(user=self.admin)

        self.customer = create_customer_profile(
            name="Lucky Id Reporting Customer",
            phone="7306200001",
        )
        self.product = create_product(
            name="Lucky Id Reporting Product",
            product_code="LUCKY-REPORT-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="LUCKYREPORT2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.available_lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)
        self.assigned_lucky_id = create_lucky_id(
            batch=self.batch,
            lucky_number=12,
            status="ASSIGNED",
        )
        self.winner_lucky_id = create_lucky_id(batch=self.batch, lucky_number=13)

        self.winner_subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.winner_lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )
        create_emi(
            subscription=self.winner_subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 10),
            status="PAID",
        )
        create_emi(
            subscription=self.winner_subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 10),
        )
        create_emi(
            subscription=self.winner_subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 10),
        )

        draw, secret_seed = create_lucky_draw_commit(batch=self.batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

    def test_lucky_id_list_and_batch_summary_distinguish_assigned_vs_won(self):
        assigned_response = self.client.get(
            f"/api/v1/admin/lucky-ids/?batch_id={self.batch.id}&status=ASSIGNED"
        )
        self.assertEqual(assigned_response.status_code, status.HTTP_200_OK)
        assigned_rows = assigned_response.data.get("results", assigned_response.data)
        self.assertEqual(len(assigned_rows), 1)
        self.assertEqual(assigned_rows[0]["lucky_number"], 12)
        self.assertEqual(assigned_rows[0]["status"], "ASSIGNED")

        won_response = self.client.get(
            f"/api/v1/admin/lucky-ids/?batch_id={self.batch.id}&status=WON"
        )
        self.assertEqual(won_response.status_code, status.HTTP_200_OK)
        won_rows = won_response.data.get("results", won_response.data)
        self.assertEqual(len(won_rows), 1)
        self.assertEqual(won_rows[0]["lucky_number"], 13)
        self.assertEqual(won_rows[0]["status"], "WON")

        summary_response = self.client.get(f"/api/v1/admin/batches/{self.batch.id}/summary/")
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data["available_lucky_ids"], 98)
        self.assertEqual(summary_response.data["assigned_lucky_ids"], 1)
        self.assertEqual(summary_response.data["won_lucky_ids"], 1)
        self.assertEqual(summary_response.data["won_subscription_count"], 1)

    def test_stale_winner_rows_are_visible_as_won_after_repair(self):
        self.winner_subscription.status = "COMPLETED"
        self.winner_subscription.save(update_fields=["status"])
        self.winner_lucky_id.status = "ASSIGNED"
        self.winner_lucky_id.save(update_fields=["status"])
        self.winner_lucky_id.refresh_from_db()
        self.assertEqual(self.winner_lucky_id.status, "ASSIGNED")

        out = StringIO()
        call_command(
            "sync_winner_states",
            "--subscription-id",
            str(self.winner_subscription.id),
            stdout=out,
        )

        lucky_response = self.client.get(
            f"/api/v1/admin/lucky-ids/?batch_id={self.batch.id}&status=WON"
        )
        rows = lucky_response.data.get("results", lucky_response.data)
        winner_row = rows[0]
        self.assertEqual(winner_row["status"], "WON")
