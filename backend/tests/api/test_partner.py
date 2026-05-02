from decimal import Decimal
from datetime import date, datetime, timezone as datetime_timezone

from django.db.models import Sum
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Commission, CommissionStatus, MONEY_ZERO
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import record_emi_payment
from subscriptions.services.winner_service import WinnerService
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_payment_collection_finance_account,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class PartnerApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="partner_admin", phone="9000000301")

        self.partner = create_partner_user(
            username="partner_primary",
            phone="9000000302",
        )
        self.other_partner = create_partner_user(
            username="partner_other",
            phone="9000000303",
        )

        self.customer_user = create_customer_user(
            username="partner_customer_user",
            phone="9000000304",
        )

        self.customer_a_user = create_customer_user(
            username="partner_customer_a",
            phone="7407533262",
        )
        self.customer_b_user = create_customer_user(
            username="partner_customer_b",
            phone="7407533263",
        )

        self.customer_a = create_customer_profile(
            user=self.customer_a_user,
            name="Amrita",
            phone="7407533262",
        )
        self.customer_b = create_customer_profile(
            user=self.customer_b_user,
            name="Rina",
            phone="7407533263",
        )

        self.product = create_product(
            name="Bajaj 10 Ltr OTG",
            product_code="BAJAJ-OTG-TEST-001",
            base_price=Decimal("2850.00"),
        )
        self.batch = create_batch(
            batch_code="APRIL2026",
            duration_months=15,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id_1 = create_lucky_id(batch=self.batch, lucky_number=14)
        self.lucky_id_2 = create_lucky_id(batch=self.batch, lucky_number=15)
        self.lucky_id_3 = create_lucky_id(batch=self.batch, lucky_number=16)
        self.finance_account = create_payment_collection_finance_account(
            code="TEST-PARTNER-COLLECT-001",
            name="Partner Test Collection Cash",
        )

        self.subscription_primary_1 = create_subscription(
            customer=self.customer_a,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_1,
            partner=self.partner,
            total_amount=Decimal("2850.00"),
            monthly_amount=Decimal("190.00"),
        )
        self.subscription_primary_2 = create_subscription(
            customer=self.customer_b,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_2,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("200.00"),
        )
        self.subscription_other = create_subscription(
            customer=self.customer_b,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id_3,
            partner=self.other_partner,
            total_amount=Decimal("4500.00"),
            monthly_amount=Decimal("300.00"),
        )

        self.emi_primary_paid = create_emi(
            subscription=self.subscription_primary_1,
            month_no=1,
            amount=Decimal("190.00"),
            due_date=date(2026, 3, 7),
        )
        self.emi_primary_future = create_emi(
            subscription=self.subscription_primary_1,
            month_no=2,
            amount=Decimal("190.00"),
            due_date=date(2026, 4, 7),
        )
        self.emi_primary_two_pending = create_emi(
            subscription=self.subscription_primary_2,
            month_no=1,
            amount=Decimal("200.00"),
            due_date=date(2026, 3, 8),
        )
        self.emi_other_paid = create_emi(
            subscription=self.subscription_other,
            month_no=1,
            amount=Decimal("300.00"),
            due_date=date(2026, 3, 9),
        )
        self.emi_other_future = create_emi(
            subscription=self.subscription_other,
            month_no=2,
            amount=Decimal("300.00"),
            due_date=date(2026, 4, 9),
        )

        self.partner_payment = record_emi_payment(
            emi_id=self.emi_primary_paid.id,
            amount=Decimal("190.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="PARTNER-TEST-PAY-001",
        )["payment"]
        self.other_partner_payment = record_emi_payment(
            emi_id=self.emi_other_paid.id,
            amount=Decimal("300.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="PARTNER-TEST-PAY-002",
        )["payment"]

    def test_partner_dashboard_success(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/dashboard/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner dashboard response: {response.status_code} {response.data}",
        )
        self.assertIn("partner", response.data)
        self.assertIn("summary", response.data)
        self.assertEqual(response.data["partner"]["username"], "partner_primary")
        self.assertEqual(response.data["partner"]["role"], "PARTNER")

        summary = response.data["summary"]
        self.assertEqual(summary["total_subscriptions"], 2)
        self.assertEqual(summary["total_customers"], 2)
        self.assertEqual(summary["paid_emis"], 1)
        self.assertGreaterEqual(summary["pending_emis"], 1)
        self.assertEqual(summary["total_revenue_collected"], "190.00")

    def test_partner_payments_only_shows_own_records(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/payments/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner payments response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["total_collected"], "190.00")
        self.assertEqual(len(response.data["results"]), 1)

        payment = response.data["results"][0]
        self.assertEqual(payment["partner_id"], self.partner.id)
        self.assertEqual(payment["partner_username"], "partner_primary")
        self.assertEqual(payment["reference_no"], "PARTNER-TEST-PAY-001")

    def test_partner_payments_filter_by_subscription(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/payments/?subscription={self.subscription_primary_1.id}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["subscription_id"],
            self.subscription_primary_1.id,
        )

    def test_partner_subscription_detail_only_returns_own_record(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/subscriptions/{self.subscription_primary_1.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner subscription detail response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["id"], self.subscription_primary_1.id)
        self.assertEqual(response.data["partner_id"], self.partner.id)

    def test_partner_subscription_detail_exposes_winner_history_separately(self):
        WinnerService.execute_winner(
            subscription_id=self.subscription_primary_1.id,
            winner_month=1,
            performed_by=self.admin,
        )
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/subscriptions/{self.subscription_primary_1.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertEqual(response.data["winner_status"], "WON")
        self.assertEqual(response.data["winner_summary"]["winner_month"], 1)
        self.assertEqual(response.data["winner_summary"]["waived_emi_count"], 1)
        self.assertEqual(response.data["winner_summary"]["waived_amount"], "190.00")

    def test_partner_subscription_detail_hides_other_partner_record(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/subscriptions/{self.subscription_other.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partner_subscription_detail_requires_partner_role(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(
            f"/api/v1/partner/subscriptions/{self.subscription_primary_1.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_payment_detail_only_returns_own_record(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/payments/{self.partner_payment.id}/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner payment detail response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["status_label"], "RECORDED")
        self.assertEqual(response.data["payment"]["id"], self.partner_payment.id)
        self.assertEqual(response.data["payment"]["partner_id"], self.partner.id)
        self.assertEqual(
            response.data["payment"]["reference_no"],
            "PARTNER-TEST-PAY-001",
        )

    def test_partner_payment_detail_hides_other_partner_record(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get(
            f"/api/v1/partner/payments/{self.other_partner_payment.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partner_commissions_empty_shape_works(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/commissions/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner commissions response: {response.status_code} {response.data}",
        )
        self.assertIn("count", response.data)
        self.assertIn("summary", response.data)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["summary"]["total_commission"], "0.00")
        self.assertEqual(response.data["summary"]["pending_commission"], "0.00")
        self.assertEqual(response.data["summary"]["settled_commission"], "0.00")

    def test_partner_earnings_summary_is_partner_scoped(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/earnings/")

        commissions = Commission.objects.filter(partner=self.partner)
        expected_total = (
            commissions.exclude(status=CommissionStatus.REVERSED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )
        expected_pending = (
            commissions.filter(status=CommissionStatus.PENDING).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )
        expected_settled = (
            commissions.filter(status=CommissionStatus.SETTLED).aggregate(
                total=Sum("commission_amount")
            )["total"]
            or MONEY_ZERO
        )
        expected_monthly_commission_count = (
            commissions.exclude(status=CommissionStatus.REVERSED)
            .values("created_at__year", "created_at__month")
            .distinct()
            .count()
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner earnings response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["total_collected"], "190.00")
        self.assertEqual(response.data["total_commission"], f"{expected_total:.2f}")
        self.assertEqual(response.data["pending_commission"], f"{expected_pending:.2f}")
        self.assertEqual(response.data["settled_commission"], f"{expected_settled:.2f}")
        self.assertEqual(len(response.data["monthly_collection"]), 1)
        self.assertEqual(
            len(response.data["monthly_commission"]),
            expected_monthly_commission_count,
        )

    def test_partner_customers_returns_only_own_customers(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/customers/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Unexpected partner customers response: {response.status_code} {response.data}",
        )
        self.assertEqual(response.data["count"], 2)
        returned_names = {row["name"] for row in response.data["results"]}
        self.assertEqual(returned_names, {"Amrita", "Rina"})

    def test_partner_dashboard_denied_to_customer(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/partner/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_payments_denied_to_customer(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/partner/payments/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_payment_detail_denied_to_customer(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(f"/api/v1/partner/payments/{self.partner_payment.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_commissions_denied_to_customer(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/partner/commissions/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_dashboard_counts_completed_winner_in_won_subscriptions(self):
        WinnerService.execute_winner(
            subscription_id=self.subscription_primary_1.id,
            winner_month=1,
            performed_by=self.admin,
        )
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["summary"]["won_subscriptions"], 1)

from decimal import Decimal
from datetime import date

from django.urls import reverse
from rest_framework.test import APIClient
from django.test import TestCase

from subscriptions.models import Commission, CommissionStatus
from subscriptions.services.payment_service import record_emi_payment, reverse_payment_for_admin
from tests.helpers import (
    create_admin_user,
    create_partner_user,
    create_customer_profile,
    create_product,
    create_batch,
    create_lucky_id,
    create_subscription,
    create_emi,
)


class PartnerCommissionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = create_admin_user(username="admin1", phone="9000000001")

        self.partner = create_partner_user(
            username="partner1",
            phone="9000000002",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.other_partner = create_partner_user(
            username="partner2",
            phone="9000000003",
        )
        self.other_partner.commission_rate = Decimal("10.00")
        self.other_partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Cust A",
            phone="7000000001",
        )

        self.product = create_product(
            name="Chair",
            product_code="CHAIR-001",
            base_price=Decimal("3000.00"),
        )

        self.batch = create_batch(
            batch_code="BATCH-TEST",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=1)
        self.finance_account = create_payment_collection_finance_account(
            code="TEST-PARTNER-COM-001",
            name="Partner Commission Collection Cash",
        )

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 10),
        )

        self.url = "/api/v1/partner/commissions/"

    def _auth_partner(self, partner):
        self.client.force_authenticate(user=partner)

    def test_partner_sees_own_commission_only(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-001",
        )

        self._auth_partner(self.partner)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        results = response.data.get("results", [])

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["subscription"], self.subscription.id)

    def test_partner_cannot_see_other_partner_commission(self):
        # create commission for partner1
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-002",
        )

        # authenticate as another partner
        self._auth_partner(self.other_partner)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        results = response.data.get("results", [])
        self.assertEqual(len(results), 0)

    def test_commission_summary_correct(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-003",
        )

        self._auth_partner(self.partner)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        summary = response.data.get("summary", {})

        self.assertEqual(summary.get("total_commission"), "50.00")
        self.assertEqual(summary.get("pending_commission"), "50.00")

    def test_reversed_commission_not_in_pending(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-004",
        )

        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="test reversal",
        )

        self._auth_partner(self.partner)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        summary = response.data.get("summary", {})

        self.assertEqual(summary.get("pending_commission"), "0.00")

    def test_customer_cannot_access_partner_commissions(self):
        self.client.force_authenticate(user=self.customer.user)

        response = self.client.get(self.url)

        self.assertIn(response.status_code, [403, 401])

    def test_partner_commission_invalid_status_returns_400(self):
        self._auth_partner(self.partner)
        response = self.client.get(f"{self.url}?status=NOT_A_STATUS")
        self.assertEqual(response.status_code, 400)

    def test_partner_commission_invalid_date_range_returns_400(self):
        self._auth_partner(self.partner)
        response = self.client.get(f"{self.url}?date_from=2026-06-01&date_to=2026-05-01")
        self.assertEqual(response.status_code, 400)

    def test_partner_commission_filter_by_status(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-FILTER-STATUS",
        )
        self._auth_partner(self.partner)
        pending = self.client.get(f"{self.url}?status=PENDING")
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(len(pending.data["results"]), 1)

        settled_resp = self.client.get(f"{self.url}?status=SETTLED")
        self.assertEqual(settled_resp.status_code, 200)
        self.assertEqual(len(settled_resp.data["results"]), 0)

        Commission.objects.filter(partner=self.partner).update(status=CommissionStatus.SETTLED)

        pending2 = self.client.get(f"{self.url}?status=PENDING")
        self.assertEqual(len(pending2.data["results"]), 0)
        settled2 = self.client.get(f"{self.url}?status=SETTLED")
        self.assertEqual(len(settled2.data["results"]), 1)

    def test_partner_commission_date_range_filter(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-FILTER-DATE",
        )
        comm = Commission.objects.get(partner=self.partner)
        Commission.objects.filter(pk=comm.pk).update(
            created_at=datetime(2026, 4, 10, 12, 0, 0, tzinfo=datetime_timezone.utc)
        )

        self._auth_partner(self.partner)
        hit = self.client.get(f"{self.url}?date_from=2026-04-01&date_to=2026-04-30")
        self.assertEqual(hit.status_code, 200)
        self.assertEqual(len(hit.data["results"]), 1)

        miss = self.client.get(f"{self.url}?date_from=2026-05-01&date_to=2026-05-31")
        self.assertEqual(miss.status_code, 200)
        self.assertEqual(len(miss.data["results"]), 0)

    def test_partner_commission_q_does_not_surface_other_partner_records(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            reference_no="API-COM-FILTER-Q-SCOPE",
        )
        self._auth_partner(self.other_partner)
        response = self.client.get(f"{self.url}?q={self.subscription.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
