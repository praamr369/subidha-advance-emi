from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, AccountingPostingProfile, ChartOfAccount, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from inventory.models import InventoryItem, InventoryItemType, PurchaseBill, StockAdjustment, StockAdjustmentLine, StockAdjustmentStatus, StockLedger, StockLocation, StockMovementType, VendorPayment
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_product


class AccountingBridgeStockLedgerPostingPhaseF8Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f8_stock_admin", phone="9304900801")
        self.cashier = create_cashier_user(username="phase_f8_stock_cashier", phone="9304900802")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.location = StockLocation.objects.create(code="F8-STOCK", name="F8 Stock Location")
        product = create_product(name="F8 Stock Product", product_code="F8-STOCK-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(product=product, sku="F8-STOCK-SKU", stock_item_type=InventoryItemType.FINISHED_GOOD, stock_tracking_enabled=True, opening_stock_qty=Decimal("0.000"), reorder_level_qty=Decimal("0.000"), standard_unit_cost=Decimal("100.00"))

    def _adjustment_line(self, *, qty=Decimal("2.000"), unit_cost=Decimal("100.00")):
        adjustment = StockAdjustment.objects.create(adjustment_no=f"F8-ADJ-{StockAdjustment.objects.count() + 1}", adjustment_date=self.today, status=StockAdjustmentStatus.POSTED, stock_location=self.location, reason="F8 bridge test")
        return StockAdjustmentLine.objects.create(stock_adjustment=adjustment, inventory_item=self.item, quantity_delta=qty, unit_cost_snapshot=unit_cost, valuation_amount_snapshot=(abs(qty) * unit_cost).quantize(Decimal("0.01")))

    def _stock_ledger(self, *, movement_type=StockMovementType.ADJUSTMENT_IN, qty=Decimal("2.000"), unit_cost=Decimal("100.00")):
        line = self._adjustment_line(qty=qty if movement_type == StockMovementType.ADJUSTMENT_IN else -abs(qty), unit_cost=unit_cost)
        return StockLedger.objects.create(inventory_item=self.item, movement_type=movement_type, quantity_in=abs(qty) if movement_type == StockMovementType.ADJUSTMENT_IN else Decimal("0.000"), quantity_out=abs(qty) if movement_type != StockMovementType.ADJUSTMENT_IN else Decimal("0.000"), movement_date=self.today, stock_location=self.location, reference_model="StockAdjustmentLine", reference_id=f"{line.stock_adjustment_id}:{line.id}", notes="F8 stock ledger bridge")

    def _candidate_id(self, row, event_key="inventory_adjustment_increase"):
        return f"stockledger:{row.id}:{event_key}"

    def _stock_snapshot(self, row):
        row.refresh_from_db()
        self.item.refresh_from_db()
        return {
            "stock": {
                "movement_type": row.movement_type,
                "quantity_in": row.quantity_in,
                "quantity_out": row.quantity_out,
                "posted_journal_entry_id": row.posted_journal_entry_id,
                "reference_model": row.reference_model,
                "reference_id": row.reference_id,
            },
            "item": {
                "opening_stock_qty": self.item.opening_stock_qty,
                "standard_unit_cost": self.item.standard_unit_cost,
                "purchase_unit_cost": self.item.purchase_unit_cost,
                "current_stock_quantity": self.item.current_stock_quantity(),
            },
            "purchase_bill_count": PurchaseBill.objects.count(),
            "vendor_payment_count": VendorPayment.objects.count(),
        }

    def test_concrete_stockledger_candidate_generation(self):
        row = self._stock_ledger()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=StockLedger")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        candidate = next(item for item in response.data["results"] if item.get("source_pk") == row.id)
        self.assertEqual(candidate["source_model"], "StockLedger")
        self.assertEqual(candidate["event_key"], "inventory_adjustment_increase")
        self.assertEqual(candidate["status"], "READY_UNPOSTED")
        self.assertEqual(candidate["movement_type"], StockMovementType.ADJUSTMENT_IN)
        self.assertEqual(candidate["quantity"], "2.000")
        self.assertEqual(candidate["unit_cost"], "100.00")
        self.assertEqual(candidate["amount"], "200.00")
        self.assertTrue(candidate["can_preview"])
        self.assertTrue(candidate["can_post"])

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        row = self._stock_ledger()
        before = {"source": self._stock_snapshot(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(row)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "StockLedger")
        self.assertEqual(response.data["source"]["movement_type"], StockMovementType.ADJUSTMENT_IN)
        self.assertEqual(response.data["total_debit"], "200.00")
        self.assertEqual(response.data["total_credit"], "200.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit stock ledger", response.data["safety_text"])
        after = {"source": self._stock_snapshot(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_stock_or_inventory(self):
        row = self._stock_ledger()
        before = self._stock_snapshot(row)
        candidate_id = self._candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F8 stock bridge test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "StockLedger")
        self.assertEqual(journal.source_id, str(row.id))
        self.assertEqual(journal.voucher_type, "INVENTORY_ADJUSTMENT_INCREASE")
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="StockLedger", source_id=str(row.id), purpose="INVENTORY_ADJUSTMENT_INCREASE").count(), 1)
        item = ReconciliationItem.objects.get(source_type="StockLedger", source_id=str(row.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._stock_snapshot(row), before)

    def test_idempotency_duplicate_key_non_admin_and_blockers(self):
        row = self._stock_ledger()
        candidate_id = self._candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_unsupported_missing_mapping_missing_numbering_and_blocked_period_reject(self):
        unsupported = StockLedger.objects.create(inventory_item=self.item, movement_type=StockMovementType.SALE_OUT, quantity_in=Decimal("0.000"), quantity_out=Decimal("1.000"), movement_date=self.today, stock_location=self.location, reference_model="BillingInvoiceLine", reference_id="1:1")
        unsupported_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/stockledger:{unsupported.id}:deferred_cogs/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(unsupported_post.status_code, status.HTTP_400_BAD_REQUEST)
        missing_mapping = self._stock_ledger()
        ChartOfAccount.objects.filter(system_code="INVENTORY_ADJUSTMENT").update(is_active=False)
        AccountingPostingProfile.objects.filter(key="INVENTORY_ADJUSTMENT").update(is_active=False)
        missing_mapping_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(missing_mapping)}/preview/")
        self.assertEqual(missing_mapping_preview.status_code, status.HTTP_200_OK, missing_mapping_preview.data)
        self.assertFalse(missing_mapping_preview.data["can_post"])
        ChartOfAccount.objects.filter(system_code="INVENTORY_ADJUSTMENT").update(is_active=True)
        AccountingPostingProfile.objects.filter(key="INVENTORY_ADJUSTMENT").update(is_active=True)
        blocked = self._stock_ledger()
        candidate_id = self._candidate_id(blocked)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

    def test_batch_post_verify_and_reconciliation_run_diagnostics(self):
        row = self._stock_ledger()
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F8_TEST", module="ACCOUNTING_BRIDGE", date_from=row.movement_date, date_to=row.movement_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        missing_item = ReconciliationItem.objects.get(run=run, source_type="StockLedger", source_id=str(row.id), exception_code="STOCK_LEDGER_MISSING_ACCOUNTING_BRIDGE_POSTING")
        missing_item.status = ReconciliationItemStatus.RESOLVED
        missing_item.save(update_fields=["status", "updated_at"])
        candidate_id = self._candidate_id(row)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        item_id = batch_post.data["posted"][0]["reconciliation_item"]["id"]
        before = self._stock_snapshot(row)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=item_id).status, ReconciliationItemStatus.MATCHED)
        self.assertEqual(self._stock_snapshot(row), before)
