from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
    JournalEntry,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from billing.models import ReceiptDocument
from inventory.models import PurchaseBill, StockLedger
from manufacturing.models import ManufacturingBom, ProductionJob
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import Payment


User = get_user_model()


class InventoryManufacturingBridgeReadinessPhase8Tests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="inventory_manufacturing_phase8_admin",
            email="inventory-manufacturing-phase8@example.com",
            password="pass1234",
            phone="01719990058",
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

    def test_inventory_and_manufacturing_readiness_events_are_exposed(self):
        events = self._events()
        required = {
            "inventory_purchase_receive",
            "inventory_adjustment_gain",
            "inventory_adjustment_loss",
            "inventory_delivery_out",
            "manufacturing_consumption",
            "manufacturing_output",
            "manufacturing_wastage",
        }
        self.assertTrue(required.issubset(events.keys()))
        for event_key in required:
            self.assertEqual(events[event_key]["posting_mode"], "AUDIT_DEFERRED")
            self.assertFalse(events[event_key]["can_post"])

    def test_valid_inventory_asset_mapping_makes_inventory_receive_side_ready(self):
        self._bootstrap()
        events = self._events()
        receive = events["inventory_purchase_receive"]
        self.assertGreaterEqual(len(receive["debit_accounts"]), 1)
        self.assertTrue(
            any(account.get("purpose") == FinanceAccountMappingPurpose.INVENTORY_ASSET for account in receive["finance_accounts"])
        )
        self.assertFalse(
            any("INVENTORY_ASSET" in reason for reason in receive["blocking_reasons"])
        )

    def test_missing_cogs_blocks_delivery_out_readiness(self):
        self._bootstrap()
        ChartOfAccount.objects.filter(system_code="COGS").delete()
        events = self._events()
        delivery = events["inventory_delivery_out"]
        self.assertEqual(delivery["status"], "NOT_CONFIGURED")
        self.assertTrue(any("COGS" in reason for reason in delivery["blocking_reasons"]))

    def test_missing_inventory_asset_mapping_blocks_inventory_adjustment_readiness(self):
        self._bootstrap()
        FinanceAccountCoaMapping.objects.filter(
            purpose=FinanceAccountMappingPurpose.INVENTORY_ASSET,
            is_active=True,
        ).update(is_active=False)
        events = self._events()
        affected = [events["inventory_purchase_receive"], events["inventory_adjustment_loss"]]
        self.assertTrue(
            any(
                event["status"] == "WARNING"
                and any("INVENTORY_ASSET" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_manufacturing_missing_wip_returns_not_configured_or_warning(self):
        self._bootstrap()
        ChartOfAccount.objects.filter(system_code="WORK_IN_PROGRESS_INVENTORY").update(is_active=False)
        events = self._events()
        affected = [events["manufacturing_consumption"], events["manufacturing_output"]]
        self.assertTrue(
            any(
                event["status"] in {"ERROR", "NOT_CONFIGURED", "WARNING"}
                and any("WORK_IN_PROGRESS_INVENTORY" in reason or "inactive" in reason for reason in event["blocking_reasons"])
                for event in affected
            )
        )

    def test_manufacturing_wastage_without_dedicated_loss_account_is_not_configured(self):
        self._bootstrap()
        ChartOfAccount.objects.filter(system_code="MANUFACTURING_WASTAGE").delete()
        events = self._events()
        wastage = events["manufacturing_wastage"]
        self.assertEqual(wastage["status"], "NOT_CONFIGURED")
        self.assertTrue(any("MANUFACTURING_WASTAGE" in reason for reason in wastage["blocking_reasons"]))

    def test_readiness_creates_no_inventory_manufacturing_or_financial_records(self):
        before = {
            "stock_ledger": StockLedger.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "boms": ManufacturingBom.objects.count(),
            "production_jobs": ProductionJob.objects.count(),
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }
        response = self.client.get("/api/v1/admin/accounting/bridge-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        after = {
            "stock_ledger": StockLedger.objects.count(),
            "purchase_bills": PurchaseBill.objects.count(),
            "boms": ManufacturingBom.objects.count(),
            "production_jobs": ProductionJob.objects.count(),
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
            "settlement_allocations": SettlementAllocation.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }
        self.assertEqual(after, before)
