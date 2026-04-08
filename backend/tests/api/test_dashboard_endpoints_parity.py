from datetime import timedelta
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
)
from subscriptions.services.dashboard_scopes import (
    AdminScope,
    CashierScope,
    CustomerScope,
    PartnerScope,
)
from subscriptions.services.lucky_draw_service import (
    create_lucky_draw_commit,
    reveal_and_execute_draw,
)
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class DashboardEndpointsParityApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="dashboard_parity_admin",
            phone="9330000001",
        )
        self.cashier = create_cashier_user(
            username="dashboard_parity_cashier",
            phone="9330000002",
        )
        self.partner = create_partner_user(
            username="dashboard_parity_partner",
            phone="9330000003",
        )
        self.customer_user = create_customer_user(
            username="dashboard_parity_customer",
            phone="7330000001",
            email="dashboard-parity@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Dashboard Parity Customer",
            phone="7330000001",
        )
        self.product = create_product(
            name="Dashboard Parity Product",
            product_code="PARITY-001",
            base_price=Decimal("3000.00"),
        )

        self._create_partner_active_subscription()
        self._create_partner_winner_subscription()

    def _create_partner_active_subscription(self):
        batch = create_batch(
            batch_code="PARITY-ACTIVE-2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=30),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=7)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=30),
        )
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=20),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=3),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=10),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.cashier,
            method="CASH",
            reference_no="PARITY-ACTIVE-PAY-001",
            payment_date=self.today,
        )

    def _create_partner_winner_subscription(self):
        batch = create_batch(
            batch_code="PARITY-WIN-2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=24),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=8)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=24),
        )
        first_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=12),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=15),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=45),
        )
        record_emi_payment(
            emi_id=first_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="PARITY-WIN-PAY-001",
            payment_date=self.today - timedelta(days=11),
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )

    def assertCanonicalSummary(self, actual, expected):
        for key, value in expected.items():
            self.assertEqual(actual[key], value, f"Mismatch for summary field {key}")

    def test_admin_dashboard_endpoint_matches_canonical_service(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/admin/dashboard/")
        expected = get_dashboard_summary(AdminScope(), self.admin)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertCanonicalSummary(response.data["summary"], expected.summary)
        self.assertEqual(response.data["winner_surface"], expected.winner_surface)
        self.assertEqual(
            response.data["reconciliation"]["flagged_count"],
            expected.reconciliation["flagged_count"],
        )
        self.assertEqual(
            [row["subscription_id"] for row in response.data["due_subscriptions"]],
            [row["subscription_id"] for row in expected.due_subscriptions[:10]],
        )

    def test_partner_dashboard_endpoint_matches_canonical_service(self):
        self.client.force_authenticate(user=self.partner)

        response = self.client.get("/api/v1/partner/dashboard/")
        expected = get_dashboard_summary(PartnerScope(), self.partner)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertCanonicalSummary(response.data["summary"], expected.summary)
        self.assertEqual(response.data["winner_surface"], expected.winner_surface)
        self.assertEqual(
            response.data["reconciliation"]["flagged_count"],
            expected.reconciliation["flagged_count"],
        )
        self.assertEqual(
            response.data["partner"]["id"],
            self.partner.id,
        )
        self.assertEqual(
            [row["subscription_id"] for row in response.data["due_subscriptions"]],
            [row["subscription_id"] for row in expected.due_subscriptions[:10]],
        )

    def test_cashier_dashboard_endpoint_matches_canonical_service(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get("/api/v1/cashier/dashboard/")
        expected = get_dashboard_summary(CashierScope(), self.cashier)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertCanonicalSummary(response.data["summary"], expected.summary)
        self.assertEqual(response.data["winner_surface"], expected.winner_surface)
        self.assertEqual(
            response.data["reconciliation"]["flagged_count"],
            expected.reconciliation["flagged_count"],
        )
        self.assertEqual(
            [row["subscription_id"] for row in response.data["due_subscriptions"]],
            [row["subscription_id"] for row in expected.due_subscriptions],
        )

    def test_customer_dashboard_endpoint_matches_canonical_service(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get("/api/v1/customer/dashboard/")
        expected = get_dashboard_summary(CustomerScope(), self.customer_user)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertCanonicalSummary(response.data["summary"], expected.summary)
        self.assertEqual(response.data["customer"]["id"], self.customer.id)
