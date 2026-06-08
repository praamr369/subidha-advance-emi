from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, FinancialYear, JournalEntry, JournalEntryStatus, JournalEntryType, MoneyMovement
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Payment
from tests.helpers import ensure_test_accounting_posting_prerequisites


User = get_user_model()


class AccountingBridgeReconciliationPhase10Tests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="bridge_reconciliation_phase10_admin",
            email="bridge-reconciliation-phase10@example.com",
            password="pass1234",
            phone="01719990080",
            role="ADMIN",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def _get(self, query=""):
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/{query}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _ready_period_context(self):
        prereqs = ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        apply_accounting_setup_defaults(performed_by=self.admin)
        return prereqs["financial_year"], prereqs["accounting_period"]

    def test_endpoint_loads(self):
        payload = self._get()
        self.assertIn("summary", payload)
        self.assertIn("results", payload)
        self.assertIn("source_count", payload["summary"])
        self.assertIsInstance(payload["results"], list)

    def test_blocked_sources_show_reason(self):
        payload = self._get("?status=BLOCKED_BY_MAPPING")
        self.assertTrue(payload["results"])
        self.assertTrue(any(row["exception_reasons"] for row in payload["results"]))
        self.assertTrue(all(row["status"] == "BLOCKED_BY_MAPPING" for row in payload["results"]))

    def test_posted_sources_link_to_journal_entry(self):
        journal = JournalEntry.objects.create(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_by=self.admin,
            posted_at=timezone.now(),
            source_model="Payment",
            source_id="98765",
            voucher_type="PAYMENT_COLLECTION",
            source_type="PAYMENT_COLLECTION",
            source_reference="PHASE10-POSTED",
        )
        AccountingBridgePosting.objects.create(
            source_model="Payment",
            source_id="98765",
            purpose="PAYMENT_COLLECTION",
            journal_entry=journal,
            source_type="PAYMENT_COLLECTION",
            source_reference="PHASE10-POSTED",
            source_event_date=timezone.localdate(),
            source_document_no="PHASE10-POSTED",
            voucher_type="PAYMENT_COLLECTION",
        )

        payload = self._get("?status=POSTED")
        row = next((item for item in payload["results"] if item.get("source_id") == "98765"), None)
        self.assertIsNotNone(row)
        self.assertEqual(row["journal_entry"]["id"], journal.id)
        self.assertEqual(row["journal_entry"]["entry_no"], journal.entry_no)

    def test_filters_work_by_module_and_event_key(self):
        payload = self._get("?module=billing&event_key=direct_sale_invoice")
        self.assertTrue(payload["results"])
        self.assertTrue(all(row["module"] == "billing" for row in payload["results"]))
        self.assertTrue(all(row["event_key"] == "direct_sale_invoice" for row in payload["results"]))

    def test_read_endpoint_creates_no_financial_or_reconciliation_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }
        self._get()
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }
        self.assertEqual(after, before)

    def test_open_selected_period_allows_bridge_postability(self):
        financial_year, period = self._ready_period_context()

        payload = self._get(f"?financial_year={financial_year.id}&accounting_period={period.id}")

        self.assertEqual(payload["selected_accounting_period"]["status"], AccountingPeriodStatus.OPEN)
        self.assertEqual(payload["summary"]["blocked_by_period_count"], 0)
        self.assertTrue(
            any(row["status"] in {"POSTABLE", "READY_UNPOSTED", "BLOCKED_BY_APPROVAL", "UNSUPPORTED_SOURCE"} for row in payload["results"])
        )
        self.assertFalse(
            any(row["status"] == "BLOCKED_BY_PERIOD" and str(row.get("period_status")).upper() == AccountingPeriodStatus.OPEN for row in payload["results"])
        )

    def test_locked_selected_period_blocks_bridge_postability(self):
        financial_year, period = self._ready_period_context()
        period.status = AccountingPeriodStatus.LOCKED
        period.is_locked = True
        period.save(update_fields=["status", "is_locked", "updated_at"])

        payload = self._get(f"?financial_year={financial_year.id}&accounting_period={period.id}&status=BLOCKED_BY_PERIOD")

        self.assertGreater(payload["summary"]["blocked_by_period_count"], 0)
        self.assertTrue(payload["results"])
        self.assertTrue(all("locked" in (row.get("blocker_reason") or "").lower() for row in payload["results"]))

    def test_closed_selected_period_blocks_bridge_postability(self):
        financial_year, period = self._ready_period_context()
        period.status = AccountingPeriodStatus.CLOSED
        period.is_locked = True
        period.save(update_fields=["status", "is_locked", "updated_at"])

        payload = self._get(f"?financial_year={financial_year.id}&accounting_period={period.id}&status=BLOCKED_BY_PERIOD")

        self.assertGreater(payload["summary"]["blocked_by_period_count"], 0)
        self.assertTrue(payload["results"])
        self.assertTrue(all("closed" in (row.get("blocker_reason") or "").lower() for row in payload["results"]))

    def test_missing_selected_period_blocks_bridge_postability(self):
        financial_year, _period = self._ready_period_context()

        payload = self._get(f"?financial_year={financial_year.id}&accounting_period=999999&status=BLOCKED_BY_PERIOD")

        self.assertGreater(payload["summary"]["blocked_by_period_count"], 0)
        self.assertTrue(payload["results"])
        self.assertTrue(all("missing" in (row.get("blocker_reason") or "").lower() for row in payload["results"]))

    def test_inactive_financial_year_blocks_bridge_postability(self):
        active_year, period = self._ready_period_context()
        inactive_year = FinancialYear.objects.create(
            code="FY2099-00",
            name="FY 2099-00",
            start_date=active_year.start_date,
            end_date=active_year.end_date,
            is_active=False,
        )
        period.financial_year = inactive_year
        period.code = f"{inactive_year.code}-TEST"
        period.save(update_fields=["financial_year", "code", "updated_at"])

        payload = self._get(f"?financial_year={inactive_year.id}&accounting_period={period.id}&status=BLOCKED_BY_PERIOD")

        self.assertGreater(payload["summary"]["blocked_by_period_count"], 0)
        self.assertTrue(payload["results"])
        self.assertTrue(all("active financial year" in (row.get("blocker_reason") or "").lower() for row in payload["results"]))
