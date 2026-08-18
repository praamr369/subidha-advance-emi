"""Regression coverage for the Owner Fund Injection admin API.

Guards the crash that the endpoint-smoke gate caught: a GET on the POST-only
`schedule-preview/` route reached `AdminOwnerLoanScheduleView.get()` with no
`pk` and raised TypeError (HTTP 500). It must return 405 instead.
"""
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import OwnerFundInjectionType, OwnerLoanInterestType
from tests.helpers import (
    create_admin_user,
    create_finance_account,
    ensure_test_accounting_posting_prerequisites,
)


class OwnerFundsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="owner_funds_admin", phone="9387700501")
        ensure_test_accounting_posting_prerequisites(performed_by=self.admin)
        self.client.force_authenticate(user=self.admin)
        self.account = create_finance_account(code="OWNER-FIN-01", name="Owner Cash")

    def test_get_on_schedule_preview_returns_405_not_500(self):
        """The preview route is POST-only; a GET must not crash (was TypeError 500)."""
        resp = self.client.get("/api/v1/admin/finance/owner-funds/schedule-preview/")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_post_schedule_preview_returns_schedule(self):
        resp = self.client.post(
            "/api/v1/admin/finance/owner-funds/schedule-preview/",
            {
                "amount": "120000",
                "tenure_months": 12,
                "interest_rate": "12",
                "interest_type": OwnerLoanInterestType.REDUCING,
                "repayment_frequency": "MONTHLY",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(len(body["schedule"]), 12)
        self.assertEqual(body["summary"]["principal"], "120000")

    def test_capital_injection_create_and_list(self):
        create = self.client.post(
            "/api/v1/admin/finance/owner-funds/",
            {
                "injection_type": OwnerFundInjectionType.CAPITAL,
                "amount": "50000",
                "date": "2026-08-01",
                "finance_account_id": self.account.id,
                "description": "Seed capital",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.content)

        listing = self.client.get("/api/v1/admin/finance/owner-funds/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(listing.json()["count"], 1)

    def test_loan_schedule_get_with_pk(self):
        create = self.client.post(
            "/api/v1/admin/finance/owner-funds/",
            {
                "injection_type": OwnerFundInjectionType.LOAN,
                "amount": "60000",
                "date": "2026-08-01",
                "finance_account_id": self.account.id,
                "tenure_months": 6,
                "interest_rate": "10",
                "interest_type": OwnerLoanInterestType.FLAT,
                "repayment_frequency": "MONTHLY",
                "repayment_start_date": "2026-09-01",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.content)
        injection_id = create.json()["id"]

        schedule = self.client.get(
            f"/api/v1/admin/finance/owner-funds/{injection_id}/schedule/"
        )
        self.assertEqual(schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(len(schedule.json()["schedule"]), 6)
