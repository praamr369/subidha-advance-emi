from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.db.models import Sum
from django.urls import resolve
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import Payment
from subscriptions.services.phase5_filter_service import parse_admin_report_filters, SUPPORTED_FILTERS
from subscriptions.services.reports_center_service import REPORT_KEYS, run_report
from tests.helpers import create_admin_user
from tests.helpers import create_cashier_user


class ReportsCenterApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="rc_admin", phone="9306000001")
        self.client.force_authenticate(user=self.admin)

    def test_resolve_export_route(self):
        match = resolve("/api/v1/admin/reports-center/reports/daily-collection/export/")
        self.assertEqual(match.func.view_class.__name__, "AdminReportsCenterExportView")

    def test_catalog_returns_sections(self):
        response = self.client.get("/api/v1/admin/reports-center/catalog/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("sections", response.data)
        keys = {r["key"] for sec in response.data["sections"] for r in sec["reports"]}
        self.assertTrue(REPORT_KEYS.issubset(keys))

    def test_each_report_loads(self):
        for key in sorted(REPORT_KEYS):
            response = self.client.get(f"/api/v1/admin/reports-center/reports/{key}/")
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                msg=f"report {key}: {getattr(response, 'data', response.content)}",
            )
            self.assertEqual(response.data["report_key"], key)
            self.assertIn("rows", response.data)
            self.assertIn("columns", response.data)

    def test_date_filters_applied_on_daily_collection(self):
        today = timezone.localdate()
        response = self.client.get(
            "/api/v1/admin/reports-center/reports/daily-collection/",
            {"date_from": today.isoformat(), "date_to": today.isoformat()},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["filters_applied"]["date_from"], today.isoformat())
        self.assertEqual(response.data["filters_applied"]["date_to"], today.isoformat())

    def test_daily_collection_totals_match_payments(self):
        today = timezone.localdate()
        qd = {"date_from": today.isoformat(), "date_to": today.isoformat()}
        flt = parse_admin_report_filters(qd, applicable_filters=SUPPORTED_FILTERS)
        payload = run_report(report_key="daily-collection", flt=flt)
        qs = Payment.objects.filter(payment_date__gte=today, payment_date__lte=today)
        expected = qs.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")
        self.assertEqual(payload["totals"]["amount_total"], f"{expected.quantize(Decimal('0.01')):.2f}")

    def test_export_csv_requires_capability(self):
        with patch("api.v1.views.reports_center.user_has_capability", return_value=False):
            response = self.client.get(
                "/api/v1/admin/reports-center/reports/daily-collection/export/",
                {"format": "csv", "date_from": "2026-01-01", "date_to": "2026-05-01"},
            )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_csv_allowed_with_capability(self):
        response = self.client.get(
            "/api/v1/admin/reports-center/reports/daily-collection/export/",
            {"format": "csv", "date_from": "2026-01-01", "date_to": "2026-05-01"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])

    def test_report_get_does_not_mutate_payment_count(self):
        before = Payment.objects.count()
        self.client.get("/api/v1/admin/reports-center/reports/payment-method/")
        self.client.get("/api/v1/admin/reports-center/reports/payment-method/", {"date_from": "2026-01-01"})
        after = Payment.objects.count()
        self.assertEqual(before, after)

    def test_non_admin_cannot_access_reports_center(self):
        cashier = create_cashier_user(username="rc_cashier", phone="9306000002")
        self.client.force_authenticate(user=cashier)
        response = self.client.get("/api/v1/admin/reports-center/catalog/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
