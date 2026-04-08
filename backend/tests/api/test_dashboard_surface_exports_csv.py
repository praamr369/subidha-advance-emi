import csv
from datetime import timedelta
from decimal import Decimal
from io import StringIO

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
class DashboardSurfaceCsvExportApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        today = timezone.localdate()
        self.admin = create_admin_user(username="dash_csv_admin", phone="9363200001")
        customer_user = create_customer_user(username="dash_csv_customer", phone="7363200001")
        customer = create_customer_profile(user=customer_user, name="Dash CSV Customer", phone="7363200001")
        product = create_product(name="Dash CSV Product", product_code="DCSV-001", base_price=Decimal("2000.00"))
        batch = create_batch(
            batch_code="DASHCSV2026",
            duration_months=2,
            total_slots=100,
            draw_day=5,
            start_date=today - timedelta(days=30),
        )
        lucky = create_lucky_id(batch=batch, lucky_number=21)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky,
            total_amount=Decimal("2000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=2,
            start_date=today - timedelta(days=30),
        )
        emi = create_emi(
            subscription=subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=today - timedelta(days=7),
        )
        record_emi_payment(
            emi_id=emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="UPI",
            reference_no="DCSV-PAY-001",
            payment_date=today - timedelta(days=1),
        )
        self.client.force_authenticate(user=customer_user)

    def test_recent_payments_csv_export_uses_list_fields_only(self):
        response = self.client.get("/api/v1/dashboards/surfaces/recent-payments/export.csv")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        rows = list(csv.reader(StringIO(response.content.decode("utf-8"))))
        self.assertEqual(
            rows[0],
            [
                "payment_id",
                "amount",
                "payment_date",
                "created_at",
                "method",
                "reference_no",
                "customer_name",
                "customer_phone",
                "subscription_number",
                "batch_code",
                "lucky_number",
                "is_reversed",
            ],
        )
        self.assertNotIn("count", rows[0])
        self.assertEqual(rows[1][5], "DCSV-PAY-001")
