from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

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
from subscriptions.services.subscription_financial_service import (
    build_customer_dashboard_summary,
)
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


class DashboardCanonicalSummaryTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="dashboard_scope_admin",
            phone="9310000001",
        )
        self.cashier = create_cashier_user(
            username="dashboard_scope_cashier",
            phone="9310000002",
        )
        self.partner = create_partner_user(
            username="dashboard_scope_partner",
            phone="9310000003",
        )
        self.other_partner = create_partner_user(
            username="dashboard_scope_partner_other",
            phone="9310000004",
        )
        self.customer_user = create_customer_user(
            username="dashboard_scope_customer",
            phone="7310000001",
            email="dashboard-scope@example.com",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Dashboard Scope Customer",
            phone="7310000001",
        )
        self.other_customer = create_customer_profile(
            name="Other Scope Customer",
            phone="7310000002",
        )
        self.product = create_product(
            name="Canonical Dashboard Product",
            product_code="CAN-DASH-001",
            base_price=Decimal("3000.00"),
        )

        self.active_subscription = self._create_active_subscription()
        self.winner_subscription = self._create_winner_subscription()
        self.other_partner_subscription = self._create_other_partner_subscription()

    def _create_active_subscription(self):
        batch = create_batch(
            batch_code="CANACTIVE2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=35),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=35),
        )
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=28),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=5),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=6),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="CAN-ACTIVE-PAY-001",
            payment_date=self.today - timedelta(days=27),
        )
        return subscription

    def _create_winner_subscription(self):
        batch = create_batch(
            batch_code="CANWIN2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=25),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=18)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=25),
        )
        winner_paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=15),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=12),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=42),
        )
        record_emi_payment(
            emi_id=winner_paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="CAN-WINNER-PAY-001",
            payment_date=self.today - timedelta(days=14),
        )
        draw, secret_seed = create_lucky_draw_commit(batch=batch)
        reveal_and_execute_draw(
            draw_id=draw.id,
            revealed_seed=secret_seed,
            performed_by=self.admin,
        )
        subscription.refresh_from_db()
        return subscription

    def _create_other_partner_subscription(self):
        batch = create_batch(
            batch_code="CANOTHER2026",
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=18),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=27)
        subscription = create_subscription(
            customer=self.other_customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.other_partner,
            total_amount=Decimal("2000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=2,
            start_date=self.today - timedelta(days=18),
        )
        paid_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=10),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=20),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.cashier,
            method="CASH",
            reference_no="CAN-OTHER-PAY-001",
            payment_date=self.today - timedelta(days=9),
        )
        return subscription

    def _expected_summary(self, scope, actor_user):
        subscriptions = list(
            scope.get_subscription_queryset(actor_user).order_by("-created_at", "-id")
        )
        return build_customer_dashboard_summary(subscriptions)

    def test_admin_scope_uses_canonical_customer_rollup(self):
        dto = get_dashboard_summary(AdminScope(), self.admin)
        expected = self._expected_summary(AdminScope(), self.admin)

        self.assertEqual(dto.summary, expected)
        self.assertEqual(dto.summary["subscription_count"], 3)
        self.assertEqual(dto.summary["winner_subscriptions"], 1)
        self.assertEqual(dto.winner_surface["waived_emis"], 2)
        self.assertGreaterEqual(dto.reconciliation["checked_count"], 1)
        self.assertEqual(dto.due_subscriptions[0]["subscription_id"], self.active_subscription.id)

    def test_partner_scope_keeps_canonical_math_but_filters_visibility(self):
        dto = get_dashboard_summary(PartnerScope(), self.partner)
        expected = self._expected_summary(PartnerScope(), self.partner)

        self.assertEqual(dto.summary, expected)
        self.assertEqual(dto.summary["subscription_count"], 2)
        self.assertEqual(dto.metrics["total_customers"], 1)
        self.assertEqual(dto.metrics["verified_payment_count"], 2)
        self.assertNotIn(
            self.other_partner_subscription.id,
            [row["subscription_id"] for row in dto.due_subscriptions],
        )

    def test_cashier_scope_shares_admin_canonical_financial_summary(self):
        admin_dto = get_dashboard_summary(AdminScope(), self.admin)
        cashier_dto = get_dashboard_summary(CashierScope(), self.cashier)

        self.assertEqual(cashier_dto.summary, admin_dto.summary)
        self.assertEqual(
            [row["subscription_id"] for row in cashier_dto.due_subscriptions],
            [row["subscription_id"] for row in admin_dto.due_subscriptions],
        )

    def test_customer_scope_matches_customer_subscription_rollup(self):
        dto = get_dashboard_summary(CustomerScope(), self.customer_user)
        expected = self._expected_summary(CustomerScope(), self.customer_user)

        self.assertEqual(dto.summary, expected)
        self.assertEqual(dto.identity["customer"]["id"], self.customer.id)
        self.assertEqual(dto.summary["subscription_count"], 2)
        self.assertEqual(dto.summary["total_paid_amount"], "2000.00")
