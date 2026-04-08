from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
    resolve_dashboard_window,
)
from subscriptions.services.dashboard_scopes import AdminScope
from subscriptions.services.payment_service import record_emi_payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DashboardSummaryV2Tests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="dashboard_v2_admin",
            phone="9361000001",
        )
        self.customer = create_customer_profile(
            name="Dashboard V2 Customer",
            phone="7361000001",
        )
        self.product = create_product(
            name="Dashboard V2 Product",
            product_code="DASH-V2-001",
            base_price=Decimal("3000.00"),
        )
        batch = create_batch(
            batch_code="DASHV22026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=60),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=19)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=60),
        )
        paid_emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=50),
        )
        create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=7),
        )
        create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=12),
        )
        record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DASH-V2-PAY-001",
            payment_date=self.today - timedelta(days=49),
        )

    def test_summary_v2_filters_do_not_change_canonical_summary_totals(self):
        default_summary = get_dashboard_summary(AdminScope(), self.admin)
        filtered_summary = get_dashboard_summary(
            AdminScope(),
            self.admin,
            window_params=resolve_dashboard_window(window="LAST_30_DAYS"),
        )

        self.assertEqual(filtered_summary.summary, default_summary.summary)
        self.assertEqual(filtered_summary.filters["window"], "LAST_30_DAYS")

    def test_summary_v2_last_30_days_filters_due_rows_additively(self):
        filtered_summary = get_dashboard_summary(
            AdminScope(),
            self.admin,
            window_params=resolve_dashboard_window(window="LAST_30_DAYS"),
        )

        self.assertEqual(len(filtered_summary.due_subscriptions), 1)
        self.assertEqual(
            filtered_summary.due_subscriptions[0]["due_date"],
            (self.today - timedelta(days=7)).isoformat(),
        )
