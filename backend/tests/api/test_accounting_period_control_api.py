from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import FinancialYear
from tests.helpers import create_admin_user, create_customer_user


class AccountingPeriodControlApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="period_api_admin", phone="9381300001")
        self.customer = create_customer_user(username="period_api_customer", phone="9381300002")

    def test_admin_can_create_financial_year(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/v1/accounting/financial-years/",
            {
                "code": "FY2026-27",
                "name": "FY 2026-27",
                "start_date": "2026-04-01",
                "end_date": "2027-03-31",
                "notes": "API test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["code"], "FY2026-27")
        self.assertFalse(response.data["is_active"])

    def test_admin_can_activate_financial_year(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(f"/api/v1/accounting/financial-years/{financial_year.id}/activate/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["financial_year"]["is_active"])

    def test_admin_can_generate_periods(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(f"/api/v1/accounting/financial-years/{financial_year.id}/generate-periods/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created_count"], 12)
        self.assertEqual(len(response.data["periods"]), 12)

    def test_admin_can_fetch_readiness(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/v1/accounting/periods/readiness/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_ready"])
        self.assertIn("No active financial year is configured.", response.data["errors"])

    def test_non_admin_blocked_from_financial_year_endpoints(self):
        financial_year = FinancialYear.objects.create(
            code="FY2026-27",
            name="FY 2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )
        endpoints = [
            ("get", "/api/v1/accounting/financial-years/"),
            ("post", "/api/v1/accounting/financial-years/"),
            ("post", f"/api/v1/accounting/financial-years/{financial_year.id}/activate/"),
            ("post", f"/api/v1/accounting/financial-years/{financial_year.id}/generate-periods/"),
        ]

        self.client.force_authenticate(user=self.customer)
        for method, endpoint in endpoints:
            response = getattr(self.client, method)(endpoint, {}, format="json")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, msg=endpoint)
