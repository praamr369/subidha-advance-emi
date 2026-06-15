from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from decimal import Decimal

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, FinancialYear, JournalEntry, JournalEntryStatus, JournalEntryType, MoneyMovement
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from billing.models import ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Payment, PaymentMethod
from tests.helpers import (
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_default_payment_collection_accounts,
    ensure_test_accounting_posting_prerequisites,
)


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
        # Set up period/FY so period is not the blocker, but do NOT apply mapping defaults,
        # so events remain NOT_CONFIGURED → BLOCKED_BY_MAPPING.
        prereqs = ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        fy = prereqs["financial_year"]
        period = prereqs["accounting_period"]
        payload = self._get(f"?status=BLOCKED_BY_MAPPING&financial_year={fy.id}&accounting_period={period.id}")
        self.assertTrue(payload["results"])
        self.assertTrue(any(row["exception_reasons"] for row in payload["results"]))
        self.assertTrue(all(row["status"] == "BLOCKED_BY_MAPPING" for row in payload["results"]))

    def test_posted_sources_link_to_journal_entry(self):
        # Create real Payment with full subscription chain, post it via bridge, then verify
        # the POSTED row appears in results with the journal_entry link.
        ensure_test_accounting_posting_prerequisites(timezone.localdate(), performed_by=self.admin)
        apply_accounting_setup_defaults(performed_by=self.admin)
        accounts = ensure_default_payment_collection_accounts()
        customer_user = create_customer_user(username="phase10_posted_customer", phone="9819000080")
        customer = create_customer_profile(user=customer_user, phone="9819000080")
        product = create_product(product_code="PHASE10-POSTED-PRODUCT")
        batch = create_batch(batch_code="PHASE10-POSTED-BATCH")
        lucky_id = create_lucky_id(batch=batch, lucky_number=10)
        subscription = create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)
        emi = create_emi(subscription=subscription, due_date=timezone.localdate())
        payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("500.00"),
            method=PaymentMethod.CASH,
            reference_no="PHASE10-PAY-POSTED-001",
            payment_date=timezone.localdate(),
            finance_account=accounts["CASH"],
            collected_by=self.admin,
        )
        journal = JournalEntry.objects.create(
            entry_date=timezone.localdate(),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_by=self.admin,
            posted_at=timezone.now(),
            source_model="Payment",
            source_id=str(payment.id),
            voucher_type="PAYMENT_COLLECTION",
            source_type="PAYMENT_COLLECTION",
            source_reference="PHASE10-PAY-POSTED-001",
        )
        AccountingBridgePosting.objects.create(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_COLLECTION",
            journal_entry=journal,
            source_type="PAYMENT_COLLECTION",
            source_reference="PHASE10-PAY-POSTED-001",
            source_event_date=timezone.localdate(),
            source_document_no="PHASE10-PAY-POSTED-001",
            voucher_type="PAYMENT_COLLECTION",
        )

        payload = self._get("?status=POSTED")
        row = next((item for item in payload["results"] if item.get("source_id") == str(payment.id)), None)
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
