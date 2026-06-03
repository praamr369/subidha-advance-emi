from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    JournalEntry,
    MoneyMovement,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from accounting.services.purchase_vendor_bridge_guard_service import (
    POSTING_NOT_APPROVED,
    run_inventory_posting_bridges_guarded,
)
from billing.models import ReceiptDocument
from inventory.models import PurchaseBill, StockLedger
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Payment


User = get_user_model()


class PurchaseVendorBridgeReadinessPhase6Tests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="purchase_vendor_phase6_admin",
            email="purchase-vendor-phase6@example.com",
            password="pass1234",
            phone="01719990036",
            role="ADMIN",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def _bootstrap(self):
        AccountingSetupService.bootstrap(actor=self.admin, dry_run=False)

    def _events(self):
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {event["event_key"]: event for event in response.data["events"]}

    def test_purchase_vendor_readiness_events_are_exposed(self):
        events = self._events()
        required = {
            "vendor_purchase_bill",
            "vendor_payment",
            "purchase_inventory_receive",
            "vendor_return",
            "purchase_expense",
        }
        self.assertTrue(required.issubset(events.keys()))
        for event_key in required:
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")
            self.assertFalse(events[event_key]["can_post"])

    def test_missing_vendor_payable_blocks_purchase_vendor_readiness(self):
        self._bootstrap()
        ChartOfAccount.objects.filter(system_code="ACCOUNTS_PAYABLE").update(is_active=False)
        events = self._events()
        affected = [
            events[key]
            for key in ("vendor_purchase_bill", "vendor_payment", "purchase_inventory_receive", "purchase_expense")
            if key in events
        ]
        self.assertTrue(
            any(
                event["status"] in {"ERROR", "NOT_CONFIGURED"}
                and any("ACCOUNTS_PAYABLE" in reason or "inactive" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_missing_inventory_asset_mapping_blocks_purchase_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.INVENTORY_ASSET,
            is_active=True,
        ).update(is_active=False)
        events = self._events()
        affected = [
            events[key]
            for key in ("vendor_purchase_bill", "purchase_inventory_receive", "vendor_return")
            if key in events
        ]
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("INVENTORY_ASSET" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_mapped_collection_accounts_make_vendor_payment_finance_side_ready(self):
        self._bootstrap()
        events = self._events()
        vendor_payment = events["vendor_payment"]
        self.assertGreaterEqual(len(vendor_payment["finance_accounts"]), 1)
        self.assertFalse(
            any("No active real settlement FinanceAccount" in reason for reason in vendor_payment["blocking_reasons"])
        )

    def test_purchase_vendor_readiness_creates_no_financial_or_source_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
        }
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "money_movements": MoneyMovement.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
        }
        self.assertEqual(after, before)


class PurchaseVendorBridgeGuardPhase6Tests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.admin = User.objects.create_user(
            username="purchase_vendor_guard_admin",
            email="purchase-vendor-guard@example.com",
            password="pass1234",
            phone="01719990037",
            role="ADMIN",
            is_staff=True,
        )

    def test_inventory_posting_bridge_without_approval_creates_no_records(self):
        before = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
        }
        payload = run_inventory_posting_bridges_guarded(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=False,
            posting_approved=False,
            performed_by=self.admin,
        )
        after = {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
        }
        self.assertEqual(payload["status"], POSTING_NOT_APPROVED)
        self.assertEqual(payload["purchase_created"], 0)
        self.assertEqual(payload["adjustment_created"], 0)
        self.assertEqual(after, before)

    def test_inventory_posting_bridge_dry_run_does_not_require_approval(self):
        payload = run_inventory_posting_bridges_guarded(
            start_date=self.today - timedelta(days=1),
            end_date=self.today,
            dry_run=True,
            posting_approved=False,
            performed_by=self.admin,
        )
        self.assertEqual(payload["purpose"], "INVENTORY_POSTING")
        self.assertTrue(payload["dry_run"])
        self.assertNotEqual(payload.get("status"), POSTING_NOT_APPROVED)
