from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from subscriptions.services.dashboard_canonical_financial_summary_service import (
    resolve_dashboard_window,
)
from subscriptions.services.dashboard_scopes import CustomerScope, PartnerScope
from subscriptions.services.dashboard_surface_query_service import list_recent_payments
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class DashboardScopesTimeWindowTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="dashboard_window_admin",
            phone="9362000001",
        )
        self.partner = create_partner_user(
            username="dashboard_window_partner",
            phone="9362000002",
        )
        self.other_partner = create_partner_user(
            username="dashboard_window_partner_other",
            phone="9362000003",
        )
        self.customer_user = create_customer_user(
            username="dashboard_window_customer",
            phone="7362000001",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Dashboard Window Customer",
            phone="7362000001",
        )
        self.other_customer = create_customer_profile(
            name="Dashboard Window Other",
            phone="7362000002",
        )
        self.product = create_product(
            name="Dashboard Window Product",
            product_code="DASH-WINDOW-001",
            base_price=Decimal("2000.00"),
        )

        self.recent_partner_payment = self._create_paid_subscription(
            customer=self.customer,
            partner=self.partner,
            batch_code="DASH-WIN-RECENT",
            lucky_number=31,
            payment_offset_days=2,
        )
        self._create_paid_subscription(
            customer=self.customer,
            partner=self.partner,
            batch_code="DASH-WIN-OLD",
            lucky_number=32,
            payment_offset_days=40,
        )
        self._create_paid_subscription(
            customer=self.other_customer,
            partner=self.other_partner,
            batch_code="DASH-WIN-OTHER",
            lucky_number=33,
            payment_offset_days=3,
        )

    def _create_paid_subscription(
        self,
        *,
        customer,
        partner,
        batch_code: str,
        lucky_number: int,
        payment_offset_days: int,
    ):
        batch = create_batch(
            batch_code=batch_code,
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=60),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=lucky_number)
        subscription = create_subscription(
            customer=customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("2000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=2,
            start_date=self.today - timedelta(days=60),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=payment_offset_days + 1),
        )
        payment = record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no=f"{batch_code}-PAY-001",
            payment_date=self.today - timedelta(days=payment_offset_days),
        )
        return payment

    def test_partner_scope_recent_payments_honor_time_window(self):
        rows = list_recent_payments(
            scope=PartnerScope(),
            actor_user=self.partner,
            window_params=resolve_dashboard_window(window="LAST_30_DAYS"),
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["payment_id"], self.recent_partner_payment["payment"].id)

    def test_customer_scope_recent_payments_never_leak_other_customer_records(self):
        rows = list_recent_payments(
            scope=CustomerScope(),
            actor_user=self.customer_user,
            window_params=resolve_dashboard_window(window="LAST_30_DAYS"),
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["customer_name"], self.customer.name)
        self.assertEqual(rows[0]["payment_id"], self.recent_partner_payment["payment"].id)
