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
class DashboardSurfacesEndpointsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="dashboard_surface_admin",
            phone="9363000001",
        )
        self.customer_user = create_customer_user(
            username="dashboard_surface_customer",
            phone="7363000001",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Dashboard Surface Customer",
            phone="7363000001",
        )
        self.product = create_product(
            name="Dashboard Surface Product",
            product_code="DASH-SURF-001",
            base_price=Decimal("3000.00"),
        )
        batch = create_batch(
            batch_code="DASHSURFACE2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=self.today - timedelta(days=50),
        )
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=self.today - timedelta(days=50),
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
            due_date=self.today - timedelta(days=6),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=self.today + timedelta(days=10),
        )
        self.payment = record_emi_payment(
            emi_id=paid_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="BANK",
            reference_no="DASH-SURFACE-PAY-001",
            payment_date=self.today - timedelta(days=5),
        )

    def test_summary_v2_endpoint_is_role_aware_and_returns_filters(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get("/api/v1/dashboards/summary-v2/?window=LAST_30_DAYS")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["role"], "CUSTOMER")
        self.assertEqual(response.data["filters"]["window"], "LAST_30_DAYS")
        self.assertEqual(response.data["summary"]["subscription_count"], 1)

    def test_recent_payments_surface_endpoint_respects_scope_and_limit(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(
            "/api/v1/dashboards/surfaces/recent-payments/?window=LAST_30_DAYS&limit=1"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["payment_id"], self.payment["payment"].id)

    def test_overdue_and_upcoming_surfaces_return_scoped_due_rows(self):
        self.client.force_authenticate(user=self.customer_user)
        overdue_response = self.client.get("/api/v1/dashboards/surfaces/overdue/")
        upcoming_response = self.client.get("/api/v1/dashboards/surfaces/upcoming/")

        self.assertEqual(overdue_response.status_code, status.HTTP_200_OK, overdue_response.data)
        self.assertEqual(upcoming_response.status_code, status.HTTP_200_OK, upcoming_response.data)
        self.assertEqual(overdue_response.data["count"], 1)
        self.assertEqual(upcoming_response.data["count"], 1)
