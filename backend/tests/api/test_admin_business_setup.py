from decimal import Decimal

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence, FinanceAccount
from accounting.services.accounting_setup_service import AccountingSetupService
from branch_control.models import Branch, BranchStatus, CashCounter
from subscriptions.models_business_setup import BusinessProfile
from tests.helpers import create_admin_user, create_product, create_user


class AdminBusinessSetupApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="setup_admin", phone="9101000001")
        self.customer = create_user(
            username="setup_customer",
            password="CustomerPass123!",
            role="CUSTOMER",
            phone="9101000002",
            first_name="Setup",
        )

    def test_admin_only_access_is_enforced(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_business_profile_enforces_single_active_profile(self):
        BusinessProfile.objects.create(legal_name="Subidha Furniture", is_active=True)
        second = BusinessProfile(legal_name="Other Profile", is_active=True)
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_checklist_reports_ready_when_required_items_complete(self):
        self.client.force_authenticate(self.admin)

        BusinessProfile.objects.create(legal_name="Subidha Furniture", is_active=True)

        branch = Branch.objects.filter(is_primary=True).first()
        self.assertIsNotNone(branch)
        branch.status = BranchStatus.ACTIVE
        branch.save(update_fields=["status"])

        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)

        cash_finance = FinanceAccount.objects.filter(name__iexact="Main Cash Desk").first()
        self.assertIsNotNone(cash_finance)

        CashCounter.objects.create(
            code="COUNTER1",
            name="Counter 1",
            branch=branch,
            finance_account=cash_finance,
            is_active=True,
        )

        create_product()

        response = self.client.get("/api/v1/admin/business-setup/checklist/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_ready_for_go_live"])
        item_keys = {row["key"] for row in response.data["items"]}
        self.assertIn("accounting_posting_mappings", item_keys)
        self.assertIn("manual_coa_available", item_keys)
        counts = response.data["counts"]
        self.assertEqual(counts.get("accounting_missing_coa_codes"), 0)
        self.assertEqual(counts.get("accounting_missing_mapping_purposes"), 0)
        self.assertIn("total_chart_accounts", counts)
        self.assertIn("active_chart_accounts", counts)
        self.assertIn("active_root_chart_accounts", counts)
        self.assertIn("active_child_chart_accounts", counts)
        self.assertIn("active_system_chart_accounts", counts)
        self.assertIn("active_custom_chart_accounts", counts)
        self.assertIn("visible_register_count", counts)
        self.assertIn("inactive_chart_accounts", counts)
        self.assertIn("chart_active_equity", counts)

    def test_reset_preview_is_read_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/reset-preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mode"], "read_only_preview")

    def test_reset_execute_requires_preserved_admin_username(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "confirm": True,
            "preserve_username": "some_other_admin",
            "delete_non_preserved_users": True,
            "clear_auth_artifacts": True,
            "dry_run": True,
        }
        response = self.client.post("/api/v1/admin/business-setup/reset/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_document_numbering_endpoint_returns_readiness_payload(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/business-setup/document-numbering/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("sequences", response.data)
        keys = {row["key"] for row in response.data["sequences"]}
        self.assertIn("BILLING_INVOICE", keys)
        self.assertIn("BILLING_RECEIPT", keys)
        self.assertIn("DIRECT_SALE_INVOICE", keys)

    def test_document_numbering_patch_rejects_lower_next_number(self):
        self.client.force_authenticate(self.admin)
        DocumentSequence.objects.create(
            series_code="BILL_RCT",
            financial_year="2026-27",
            prefix="RCT-2026-27",
            next_number=9,
            padding=5,
            is_active=True,
        )
        response = self.client.patch(
            "/api/v1/admin/business-setup/document-numbering/",
            {"key": "BILLING_RECEIPT", "next_number": 0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
