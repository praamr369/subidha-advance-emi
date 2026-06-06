from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import DocumentSequence, JournalEntry, MoneyMovement
from billing.models import BillingInvoice, ReceiptDocument
from inventory.models import StockLedger
from reconciliation.models import ReconciliationItem
from tests.helpers import create_admin_user, create_customer_user


class FreshStartSetupReadinessTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="fresh_start_admin", phone="9304000961")
        self.client.force_authenticate(user=self.admin)

    def _counts(self):
        return {
            "journals": JournalEntry.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "invoices": BillingInvoice.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "stock_ledgers": StockLedger.objects.count(),
            "document_sequences": DocumentSequence.objects.count(),
        }

    def test_setup_readiness_returns_production_categories(self):
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        categories = {row["key"] for row in response.data["categories"]}
        self.assertIn("CORE_REQUIRED", categories)
        self.assertIn("FINANCE_ACCOUNTING_REQUIRED", categories)
        self.assertIn("RENT_LEASE_REQUIRED", categories)
        self.assertIn("INVENTORY_REQUIRED", categories)
        self.assertIn("STAFF_HR_PAYROLL_REQUIRED", categories)
        self.assertIn("CRM_REQUIRED", categories)
        self.assertIn("RESET_DRY_RUN_REQUIRED", categories)

    def test_setup_readiness_inventory_is_required_pending_without_fake_stock(self):
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        inventory = next(row for row in response.data["sections"] if row["key"] == "inventory_onboarding")
        self.assertIn(inventory["status"], {"REQUIRED_PENDING", "READY"})
        self.assertEqual(inventory["category"], "INVENTORY_REQUIRED")
        self.assertTrue(inventory["metadata"]["csv_import_required_workflow"])
        self.assertFalse(inventory["metadata"]["csv_import_required_for_initial_collection"])
        self.assertTrue(inventory["metadata"]["manual_opening_stock_required_workflow"])
        self.assertFalse(inventory["metadata"]["creates_stock_ledger_from_readiness"])
        self.assertTrue(any(item["key"] == "inventory_opening_stock_required_pending" for item in response.data["launch_checklist"]))

    def test_setup_readiness_marks_rent_lease_staff_payroll_and_crm_as_production_workflows(self):
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        sections = {row["key"]: row for row in response.data["sections"]}
        self.assertEqual(sections["rent_lease_live"]["category"], "RENT_LEASE_REQUIRED")
        self.assertEqual(sections["staff_hr_payroll"]["category"], "STAFF_HR_PAYROLL_REQUIRED")
        self.assertEqual(sections["crm_enrichment"]["category"], "CRM_REQUIRED")
        self.assertEqual(sections["staff_advance_future"]["status"], "FUTURE_UNSUPPORTED")
        self.assertFalse(sections["staff_advance_future"]["metadata"]["posting_supported"])

    def test_fresh_start_preview_is_read_only(self):
        before = self._counts()
        response = self.client.get("/api/v1/admin/setup/ensure-fresh-start/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["mode"], "read_only_preview")
        self.assertEqual(self._counts(), before)

    def test_fresh_start_dry_run_does_not_create_financial_or_stock_records(self):
        before = self._counts()
        response = self.client.post("/api/v1/admin/setup/ensure-fresh-start/", {"dry_run": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["journal_entries_created"], 0)
        self.assertEqual(response.data["document_numbers_allocated"], 0)
        self.assertEqual(response.data["stock_ledger_created"], 0)
        self.assertEqual(response.data["reconciliation_items_created"], 0)
        self.assertEqual(self._counts(), before)

    def test_fresh_start_execute_does_not_create_operational_financial_records(self):
        before = self._counts()
        response = self.client.post("/api/v1/admin/setup/ensure-fresh-start/", {"confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        after = self._counts()
        self.assertEqual(after["journals"], before["journals"])
        self.assertEqual(after["money_movements"], before["money_movements"])
        self.assertEqual(after["invoices"], before["invoices"])
        self.assertEqual(after["receipts"], before["receipts"])
        self.assertEqual(after["reconciliation_items"], before["reconciliation_items"])
        self.assertEqual(after["stock_ledgers"], before["stock_ledgers"])
        self.assertEqual(response.data["document_numbers_allocated"], 0)

    def test_non_admin_cannot_use_fresh_start_setup(self):
        customer = create_customer_user(username="fresh_start_customer", phone="9304000962")
        self.client.force_authenticate(user=customer)
        response = self.client.get("/api/v1/admin/setup/readiness/")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        response = self.client.post("/api/v1/admin/setup/ensure-fresh-start/", {"confirm": True}, format="json")
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
