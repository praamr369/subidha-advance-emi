import tempfile
from pathlib import Path
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import DryRunValidationJob, Payment
from subscriptions.services import dry_run_control_service as drs
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
    create_user,
)


class AdminDryRunsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="dry_run_admin", phone="919300000001")
        self.customer = create_user(
            username="dry_run_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="919300000002",
            first_name="Dry",
        )

    def test_non_admin_denied_options(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/business-setup/dry-runs/options/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_denied_run(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            "/api/v1/admin/business-setup/dry-runs/run/",
            {"checks": ["SETUP_READINESS"], "scopes": [], "options": {}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_options_returns_catalog(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/dry-runs/options/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checks = response.data["checks"]
        self.assertGreaterEqual(len(checks), 8)
        keys = {c["key"] for c in checks}
        self.assertIn("SETUP_READINESS", keys)
        self.assertIn("FRONTEND_ROUTE_WORKFLOW", keys)

    def test_admin_run_returns_stable_schema_and_persists_job(self):
        self.client.force_authenticate(self.admin)
        before_jobs = DryRunValidationJob.objects.count()
        before_payments = Payment.objects.count()
        response = self.client.post(
            "/api/v1/admin/business-setup/dry-runs/run/",
            {
                "checks": ["SETUP_READINESS", "API_CONTRACT"],
                "scopes": [],
                "options": {"include_financial_checks": True},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Payment.objects.count(), before_payments)
        self.assertEqual(DryRunValidationJob.objects.count(), before_jobs + 1)
        body = response.data
        self.assertIn("run_id", body)
        self.assertEqual(body["status"], "COMPLETED")
        self.assertIn("summary", body)
        for key in ("pass", "warning", "blocked", "failed"):
            self.assertIn(key, body["summary"])
        self.assertIsInstance(body["results"], list)
        for row in body["results"]:
            for field in (
                "check",
                "status",
                "risk_level",
                "module",
                "title",
                "detail",
                "recommended_action",
                "action_href",
                "safe_to_execute",
            ):
                self.assertIn(field, row)

    def test_history_lists_recent_run(self):
        self.client.force_authenticate(self.admin)
        self.client.post(
            "/api/v1/admin/business-setup/dry-runs/run/",
            {"checks": ["API_CONTRACT"], "scopes": [], "options": {}},
            format="json",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/dry-runs/history/?limit=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        runs = response.data["runs"]
        self.assertGreaterEqual(len(runs), 1)
        self.assertIn("run_id", runs[0])
        self.assertIn("summary", runs[0])

    def test_accounting_setup_surfaces_warnings_when_mappings_missing(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/business-setup/dry-runs/run/",
            {"checks": ["ACCOUNTING_SETUP"], "scopes": [], "options": {}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        statuses = {r["status"] for r in response.data["results"]}
        self.assertTrue(statuses.intersection({"PASS", "WARNING", "BLOCKED"}))

    def test_frontend_route_workflow_blocked_when_route_missing(self):
        with patch.object(drs, "_discovered_next_admin_routes", return_value={"/admin"}):
            with patch.object(
                drs,
                "_parse_admin_route_constants_from_routes_ts",
                return_value=["/admin/this-page-should-not-exist-for-dry-run-test"],
            ):
                rows = drs._check_frontend_route_workflow()
        self.assertTrue(any(r.get("status") == "BLOCKED" for r in rows))

    def test_api_contract_reports_warning_for_unknown_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "frontend" / "src"
            src.mkdir(parents=True)
            (src / "fake_service.ts").write_text("const u = `/api/v1/this-prefix-is-not-allowed/thing`", encoding="utf-8")
            with patch.object(drs, "_repo_root", return_value=root):
                rows = drs._check_api_contract()
        self.assertTrue(any(r.get("status") == "WARNING" for r in rows))

    def test_payment_finance_dry_run_does_not_create_payments(self):
        customer = create_customer_profile(name="Dry Run Pay Customer", phone="919300000010")
        product = create_product(name="Dry Run Product", product_code="DRY-P1")
        batch = create_batch(batch_code="DRYBAT01")
        lucky = create_lucky_id(batch=batch, lucky_number=21)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky)
        Payment.objects.create(
            customer=customer,
            subscription=subscription,
            amount="500.00",
            method="CASH",
            payment_date="2026-04-12",
        )
        self.client.force_authenticate(self.admin)
        before = Payment.objects.count()
        response = self.client.post(
            "/api/v1/admin/business-setup/dry-runs/run/",
            {"checks": ["PAYMENT_FINANCE_SAFETY"], "scopes": [], "options": {"include_financial_checks": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Payment.objects.count(), before)
