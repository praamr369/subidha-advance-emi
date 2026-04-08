from datetime import timedelta
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.services.payment_service import record_emi_payment
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


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class DashboardSurfacePaginationOrderingApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="dash_paging_admin", phone="9363100001")
        self.customer_user = create_customer_user(
            username="dash_paging_customer",
            phone="7363100001",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Dash Paging Customer",
            phone="7363100001",
        )
        product = create_product(
            name="Dash Paging Product",
            product_code="DP-001",
            base_price=Decimal("5000.00"),
        )
        batch = create_batch(
            batch_code="DASHPAGE2026",
            duration_months=6,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=90),
        )

        lucky_one = create_lucky_id(batch=batch, lucky_number=11)
        sub_one = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_one,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=6,
            start_date=self.today - timedelta(days=90),
        )
        emi_one = create_emi(
            subscription=sub_one,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=20),
        )
        self.payment_one = record_emi_payment(
            emi_id=emi_one.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DP-PAY-001",
            payment_date=self.today - timedelta(days=8),
        )["payment"]

        lucky_two = create_lucky_id(batch=batch, lucky_number=12)
        sub_two = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_two,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=6,
            start_date=self.today - timedelta(days=90),
        )
        emi_two = create_emi(
            subscription=sub_two,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=10),
        )
        self.payment_two = record_emi_payment(
            emi_id=emi_two.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="DP-PAY-002",
            payment_date=self.today - timedelta(days=2),
        )["payment"]

        lucky_three = create_lucky_id(batch=batch, lucky_number=13)
        sub_three = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_three,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=6,
            start_date=self.today - timedelta(days=90),
        )
        create_emi(
            subscription=sub_three,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=15),
        )
        create_emi(
            subscription=sub_three,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=self.today - timedelta(days=3),
        )

    def test_recent_payments_surface_supports_page_and_page_size(self):
        self.client.force_authenticate(user=self.customer_user)

        first_page = self.client.get(
            "/api/v1/dashboards/surfaces/recent-payments/?page=1&page_size=1"
        )
        second_page = self.client.get(
            "/api/v1/dashboards/surfaces/recent-payments/?page=2&page_size=1"
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK, first_page.data)
        self.assertEqual(second_page.status_code, status.HTTP_200_OK, second_page.data)
        self.assertEqual(first_page.data["count"], 2)
        self.assertEqual(first_page.data["page"], 1)
        self.assertEqual(first_page.data["page_size"], 1)
        self.assertEqual(first_page.data["total_pages"], 2)
        self.assertEqual(first_page.data["results"][0]["payment_id"], self.payment_two.id)
        self.assertEqual(second_page.data["results"][0]["payment_id"], self.payment_one.id)

    def test_overdue_surface_supports_safe_ordering_allowlist(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(
            "/api/v1/dashboards/surfaces/overdue/?ordering=-overdue_days&page_size=10"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["ordering"], "-overdue_days")
        self.assertGreaterEqual(len(response.data["results"]), 1)
        if len(response.data["results"]) > 1:
            self.assertGreaterEqual(
                response.data["results"][0]["overdue_days"],
                response.data["results"][1]["overdue_days"],
            )
