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
class DashboardParityPhase3Tests(APITestCase):
    def setUp(self):
        super().setUp()
        today = timezone.localdate()
        self.admin = create_admin_user(username="dash_phase3_admin", phone="9363300001")
        self.customer_user = create_customer_user(username="dash_phase3_customer", phone="7363300001")
        customer = create_customer_profile(user=self.customer_user, name="Dash Phase3 Customer", phone="7363300001")
        product = create_product(name="Dash Phase3 Product", product_code="DP3-001", base_price=Decimal("3000.00"))
        batch = create_batch(
            batch_code="DASHP32026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=today - timedelta(days=60),
        )
        lucky = create_lucky_id(batch=batch, lucky_number=31)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
            start_date=today - timedelta(days=60),
        )
        first_emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=today - timedelta(days=25),
        )
        create_emi(
            subscription=subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=today - timedelta(days=5),
        )
        create_emi(
            subscription=subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=today + timedelta(days=9),
        )
        record_emi_payment(
            emi_id=first_emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="DP3-PAY-001",
            payment_date=today - timedelta(days=10),
        )

    def test_customer_dashboard_and_summary_v2_share_canonical_overlap(self):
        self.client.force_authenticate(user=self.customer_user)
        legacy = self.client.get("/api/v1/customer/dashboard/")
        v2 = self.client.get("/api/v1/dashboards/summary-v2/")

        self.assertEqual(legacy.status_code, status.HTTP_200_OK, legacy.data)
        self.assertEqual(v2.status_code, status.HTTP_200_OK, v2.data)
        for key in [
            "subscription_count",
            "total_paid_amount",
            "outstanding_amount",
            "pending_emis",
            "overdue_emis",
        ]:
            self.assertEqual(legacy.data["summary"][key], v2.data["summary"][key])

    def test_admin_dashboard_and_summary_v2_share_canonical_overlap(self):
        self.client.force_authenticate(user=self.admin)
        legacy = self.client.get("/api/v1/admin/dashboard/")
        v2 = self.client.get("/api/v1/dashboards/summary-v2/")

        self.assertEqual(legacy.status_code, status.HTTP_200_OK, legacy.data)
        self.assertEqual(v2.status_code, status.HTTP_200_OK, v2.data)
        for key in [
            "subscription_count",
            "total_paid_amount",
            "outstanding_amount",
            "pending_emis",
            "overdue_emis",
        ]:
            self.assertEqual(legacy.data["summary"][key], v2.data["summary"][key])

