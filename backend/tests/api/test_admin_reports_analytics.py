from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence
from billing.models import DirectSale, DirectSaleStatus
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


class AdminReportsAnalyticsSummaryApiTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.admin = create_admin_user(
            username="admin_reports_analytics",
            phone="9355000001",
        )
        self.customer = create_customer_profile(
            name="Analytics Customer",
            phone="7355000001",
        )
        self.product = create_product(
            name="Analytics Product",
            product_code="ANL-001",
            base_price=Decimal("6000.00"),
        )
        self.batch = create_batch(
            batch_code="ANLAPR2026",
            duration_months=6,
            total_slots=100,
            draw_day=7,
            start_date=self.today - timedelta(days=70),
            status="OPEN",
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=21)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=6,
            start_date=self.today - timedelta(days=70),
        )

        recent_emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("500.00"),
            due_date=self.today - timedelta(days=5),
        )
        older_emi = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("500.00"),
            due_date=self.today - timedelta(days=40),
        )
        create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("500.00"),
            due_date=self.today + timedelta(days=10),
        )

        record_emi_payment(
            emi_id=recent_emi.id,
            amount=Decimal("500.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="ANL-RECENT-001",
            payment_date=self.today - timedelta(days=5),
        )
        record_emi_payment(
            emi_id=older_emi.id,
            amount=Decimal("500.00"),
            collected_by=self.admin,
            method="UPI",
            reference_no="ANL-OLDER-001",
            payment_date=self.today - timedelta(days=40),
        )

        doc_series = DocumentSequence.objects.create(
            series_code="ANLDS2026",
            financial_year="2026-2027",
            prefix="SALE",
            next_number=1,
            padding=5,
        )
        DirectSale.objects.create(
            sale_no="SALE-ANL-001",
            sale_date=self.today - timedelta(days=3),
            financial_year="2026-2027",
            doc_series=doc_series,
            customer=self.customer,
            status=DirectSaleStatus.CONFIRMED,
            subtotal=Decimal("2500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("2500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("2500.00"),
            received_total=Decimal("2500.00"),
            balance_total=Decimal("0.00"),
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def test_admin_analytics_summary_returns_report_sections(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/reports/analytics-summary/?window=LAST_30_DAYS")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["filters"]["window"], "LAST_30_DAYS")
        self.assertIn("overview", response.data)
        self.assertIn("collections_trend", response.data)
        self.assertIn("payment_method_mix", response.data)
        self.assertIn("receivables_pressure", response.data)
        self.assertIn("subscription_mix", response.data)
        self.assertIn("reconciliation_posture", response.data)
        self.assertIn("delivery_posture", response.data)
        self.assertIn("direct_sales_posture", response.data)
        self.assertIn("finance_posture", response.data)

        self.assertEqual(
            response.data["collections_trend"]["summary"]["active_count"],
            1,
        )
        self.assertEqual(
            response.data["direct_sales_posture"]["summary"]["count"],
            1,
        )

    def test_custom_window_filters_collection_and_direct_sales_rows(self):
        self.client.force_authenticate(user=self.admin)
        start_date = (self.today - timedelta(days=45)).isoformat()
        end_date = (self.today - timedelta(days=35)).isoformat()
        response = self.client.get(
            f"/api/v1/admin/reports/analytics-summary/?window=CUSTOM&start_date={start_date}&end_date={end_date}"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["filters"]["window"], "CUSTOM")
        self.assertEqual(response.data["filters"]["start_date"], start_date)
        self.assertEqual(response.data["filters"]["end_date"], end_date)

        self.assertEqual(
            response.data["collections_trend"]["summary"]["active_count"],
            1,
        )
        self.assertEqual(
            response.data["direct_sales_posture"]["summary"]["count"],
            0,
        )

    def test_admin_analytics_summary_requires_admin_role(self):
        customer_user = create_customer_user(
            username="analytics_non_admin",
            phone="7355000099",
        )
        self.client.force_authenticate(user=customer_user)
        response = self.client.get("/api/v1/admin/reports/analytics-summary/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
