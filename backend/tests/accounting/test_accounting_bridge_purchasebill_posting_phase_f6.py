from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, DocumentSequence, JournalEntry, Vendor
from accounting.services.document_sequence_service import DocumentType
from inventory.models import InventoryItem, InventoryItemType, PurchaseBill, PurchaseBillLine, PurchaseBillStatus, PurchaseTaxMode, StockLedger
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_product


class AccountingBridgePurchaseBillPostingPhaseF6Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f6_purchase_admin", phone="9304900601")
        self.cashier = create_cashier_user(username="phase_f6_purchase_cashier", phone="9304900602")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.vendor = Vendor.objects.create(name="F6 Purchase Vendor", phone="9898000601")
        product = create_product(name="F6 Purchase Product", product_code="F6-PUR-001", base_price=Decimal("1000.00"))
        self.item = InventoryItem.objects.create(product=product, sku="F6-PUR-SKU", stock_item_type=InventoryItemType.RAW_MATERIAL, stock_tracking_enabled=True, opening_stock_qty=Decimal("0.000"), reorder_level_qty=Decimal("0.000"), standard_unit_cost=Decimal("1000.00"))

    def _bill(self, *, bill_no="F6-PB-001", status_value=PurchaseBillStatus.APPROVED, subtotal=Decimal("1000.00"), tax=Decimal("180.00")):
        bill = PurchaseBill.objects.create(bill_no=bill_no, bill_date=self.today, vendor=self.vendor, tax_mode=PurchaseTaxMode.GST if tax > 0 else PurchaseTaxMode.NON_GST, status=status_value, subtotal=subtotal, tax_total=tax, grand_total=subtotal + tax, stock_location=None, finance_account=None, notes="F6 controlled bridge test")
        PurchaseBillLine.objects.create(purchase_bill=bill, inventory_item=self.item, description="F6 purchase", quantity=Decimal("1.000"), unit_cost=subtotal, taxable_value=subtotal, tax_amount=tax, line_total=subtotal + tax)
        return bill

    def _candidate_id(self, bill, event_key="purchase_bill_accrual"):
        return f"purchasebill:{bill.id}:{event_key}"

    def _snapshot(self, bill):
        bill.refresh_from_db()
        return {"bill_no": bill.bill_no, "status": bill.status, "subtotal": bill.subtotal, "tax_total": bill.tax_total, "grand_total": bill.grand_total, "posted_journal_entry_id": bill.posted_journal_entry_id, "stock_ledger_count": StockLedger.objects.count()}

    def test_candidate_generation_for_concrete_purchase_bill(self):
        bill = self._bill(bill_no="F6-PB-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=PurchaseBill")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == bill.id)
        self.assertEqual(row["source_model"], "PurchaseBill")
        self.assertEqual(row["event_key"], "purchase_bill_accrual")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["purchase_bill_number"], "F6-PB-GEN")
        self.assertEqual(row["vendor_name"], self.vendor.name)
        self.assertEqual(row["taxable_amount"], "1000.00")
        self.assertEqual(row["tax_amount"], "180.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_preview_is_read_only_and_includes_input_gst_line(self):
        bill = self._bill(bill_no="F6-PB-TAX")
        before = {"source": self._snapshot(bill), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(bill)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "PurchaseBill")
        self.assertEqual(response.data["total_debit"], "1180.00")
        self.assertEqual(response.data["total_credit"], "1180.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        after = {"source": self._snapshot(bill), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_purchase_or_stock(self):
        bill = self._bill(bill_no="F6-PB-POST")
        before_source = self._snapshot(bill)
        candidate_id = self._candidate_id(bill)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F6 purchase bridge test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="PurchaseBill", source_id=str(bill.id), purpose="PURCHASE_BILL_ACCRUAL").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "PurchaseBill")
        self.assertEqual(journal.source_id, str(bill.id))
        self.assertEqual(journal.voucher_type, "PURCHASE_BILL_ACCRUAL")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="PurchaseBill", source_id=str(bill.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(bill), before_source)

    def test_same_key_idempotent_different_key_rejects_and_non_admin_rejects(self):
        bill = self._bill(bill_no="F6-PB-IDEMP")
        candidate_id = self._candidate_id(bill)
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

    def test_locked_missing_numbering_and_unsupported_reject(self):
        bill = self._bill(bill_no="F6-PB-BLOCK")
        draft = self._bill(bill_no="F6-PB-DRAFT", status_value=PurchaseBillStatus.DRAFT)
        unsupported = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(draft, 'purchase_bill_skipped_not_applicable')}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(unsupported.status_code, status.HTTP_400_BAD_REQUEST)
        candidate_id = self._candidate_id(bill)
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
        bill = self._bill(bill_no="F6-PB-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F6_TEST", module="ACCOUNTING_BRIDGE", date_from=bill.bill_date, date_to=bill.bill_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="PurchaseBill", source_id=str(bill.id), exception_code="PURCHASE_BILL_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        candidate_id = self._candidate_id(bill)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        item_id = batch_post.data["posted"][0]["reconciliation_item"]["id"]
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=item_id).status, ReconciliationItemStatus.MATCHED)
