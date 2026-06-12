from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, AccountingPostingProfile, ChartOfAccount, ChartOfAccountType, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from billing.models import BillingDocumentStatus, BillingInvoice, BillingInvoiceLine, BillingInvoiceType, BillingSourceType
from inventory.models import InventoryItem, InventoryItemType, StockLedger, StockLocation, StockMovementType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_product


class AccountingBridgeCogsStockOutPostingPhaseF9Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f9_cogs_admin", phone="9304900901")
        self.cashier = create_cashier_user(username="phase_f9_cogs_cashier", phone="9304900902")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.invoice_sequence = DocumentSequence.objects.create(series_code="F9-INV-SEQ", financial_year="2026-27", prefix="F9-INV", next_number=1)
        self.cogs_account, _ = ChartOfAccount.objects.get_or_create(system_code="COGS", defaults={"code": "F9-COGS", "name": "F9 Cost of Goods Sold", "account_type": ChartOfAccountType.EXPENSE})
        AccountingPostingProfile.objects.get_or_create(key="COGS", defaults={"label": "Cost of Goods Sold", "chart_account": self.cogs_account})
        self.customer = create_customer_profile(name="F9 Customer", phone="9304900903")
        self.location = StockLocation.objects.create(code="F9-STOCK", name="F9 Stock Location")
        product = create_product(name="F9 Sofa", product_code="F9-SOFA-001", base_price=Decimal("5000.00"))
        self.item = InventoryItem.objects.create(product=product, sku="F9-SOFA-SKU", stock_item_type=InventoryItemType.FINISHED_GOOD, stock_tracking_enabled=True, opening_stock_qty=Decimal("0.000"), reorder_level_qty=Decimal("0.000"), standard_unit_cost=Decimal("500.00"), default_stock_location=self.location)

    def _invoice_line(self, *, cost_snapshot=True, invoice_status=BillingDocumentStatus.APPROVED):
        invoice = BillingInvoice.objects.create(
            document_no=f"F9-INV-{BillingInvoice.objects.count() + 1}",
            document_type=BillingInvoiceType.INVOICE,
            invoice_date=self.today,
            financial_year="2026-27",
            doc_series=self.invoice_sequence,
            customer=self.customer,
            source_type=BillingSourceType.MANUAL,
            status=invoice_status,
            subtotal=Decimal("2000.00"),
            taxable_total=Decimal("2000.00"),
            grand_total=Decimal("2000.00"),
            balance_total=Decimal("2000.00"),
            customer_name_snapshot=self.customer.name,
        )
        return BillingInvoiceLine.objects.create(
            invoice=invoice,
            product=self.item.product,
            inventory_item=self.item,
            description="F9 Sofa",
            quantity=Decimal("2.000"),
            unit_price=Decimal("1000.00"),
            taxable_value=Decimal("2000.00"),
            line_total=Decimal("2000.00"),
            tax_profile_snapshot={"cogs_unit_cost": "500.00", "cogs_amount": "1000.00"} if cost_snapshot else {},
        )

    def _stock_out(self, *, cost_snapshot=True, invoice_status=BillingDocumentStatus.APPROVED):
        line = self._invoice_line(cost_snapshot=cost_snapshot, invoice_status=invoice_status)
        return StockLedger.objects.create(
            inventory_item=self.item,
            movement_type=StockMovementType.SALE_OUT,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("2.000"),
            movement_date=self.today,
            stock_location=self.location,
            reference_model="BillingInvoiceLine",
            reference_id=f"{line.invoice_id}:{line.id}",
            notes="F9 COGS stock-out",
        )

    def _candidate_id(self, row, event_key="cogs_sale_delivery"):
        return f"stockledger:{row.id}:{event_key}"

    def _snapshots(self, row):
        row.refresh_from_db()
        self.item.refresh_from_db()
        line = BillingInvoiceLine.objects.select_related("invoice").get(pk=str(row.reference_id).split(":")[-1])
        return {
            "stock": {
                "movement_type": row.movement_type,
                "quantity_in": row.quantity_in,
                "quantity_out": row.quantity_out,
                "reference_model": row.reference_model,
                "reference_id": row.reference_id,
                "posted_journal_entry_id": row.posted_journal_entry_id,
            },
            "item": {
                "opening_stock_qty": self.item.opening_stock_qty,
                "standard_unit_cost": self.item.standard_unit_cost,
                "purchase_unit_cost": self.item.purchase_unit_cost,
                "current_stock_quantity": self.item.current_stock_quantity(),
            },
            "invoice": {
                "status": line.invoice.status,
                "subtotal": line.invoice.subtotal,
                "grand_total": line.invoice.grand_total,
                "posted_journal_entry_id": line.invoice.posted_journal_entry_id,
            },
            "line_snapshot": line.tax_profile_snapshot,
        }

    def test_eligible_finalized_stock_out_candidate_generation(self):
        row = self._stock_out()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=StockLedger")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        candidate = next(item for item in response.data["results"] if item.get("source_pk") == row.id)
        self.assertEqual(candidate["event_key"], "cogs_sale_delivery")
        self.assertEqual(candidate["status"], "READY_UNPOSTED")
        self.assertEqual(candidate["movement_type"], StockMovementType.SALE_OUT)
        self.assertEqual(candidate["quantity_out"], "2.000")
        self.assertEqual(candidate["unit_cost"], "500.00")
        self.assertEqual(candidate["cogs_amount"], "1000.00")
        self.assertEqual(candidate["amount"], "1000.00")
        self.assertTrue(candidate["can_preview"])
        self.assertTrue(candidate["can_post"])

    def test_missing_cost_is_deferred_and_non_postable(self):
        row = self._stock_out(cost_snapshot=False)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=StockLedger")
        candidate = next(item for item in response.data["results"] if item.get("source_pk") == row.id)
        self.assertEqual(candidate["event_key"], "deferred_cogs")
        self.assertFalse(candidate["can_post"])
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/stockledger:{row.id}:deferred_cogs/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        row = self._stock_out()
        before = {"source": self._snapshots(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(row)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "StockLedger")
        self.assertEqual(response.data["source"]["cogs_amount"], "1000.00")
        self.assertEqual(response.data["total_debit"], "1000.00")
        self.assertEqual(response.data["total_credit"], "1000.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertIn("does not edit stock ledger", response.data["safety_text"])
        self.assertEqual({"source": self._snapshots(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_sources(self):
        row = self._stock_out()
        before = self._snapshots(row)
        candidate_id = self._candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F9 COGS bridge"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "StockLedger")
        self.assertEqual(journal.source_id, str(row.id))
        self.assertEqual(journal.voucher_type, "COGS_SALE_DELIVERY")
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="StockLedger", source_id=str(row.id), purpose="COGS_SALE_DELIVERY").count(), 1)
        item = ReconciliationItem.objects.get(source_type="StockLedger", source_id=str(row.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshots(row), before)
        bridge = AccountingBridgePosting.objects.get(source_model="StockLedger", source_id=str(row.id), purpose="COGS_SALE_DELIVERY")
        self.assertTrue((bridge.trace_metadata or {}).get("cogs_posting"))
        self.assertFalse((bridge.trace_metadata or {}).get("stock_ledger_mutation"))
        self.assertFalse((bridge.trace_metadata or {}).get("inventory_item_mutation"))
        self.assertFalse((bridge.trace_metadata or {}).get("sale_delivery_mutation"))

    def test_idempotency_duplicate_key_non_admin_and_blockers(self):
        row = self._stock_out()
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

    def test_missing_mappings_numbering_and_blocked_period_reject(self):
        missing_cogs = self._stock_out()
        ChartOfAccount.objects.filter(system_code="COGS").update(is_active=False)
        AccountingPostingProfile.objects.filter(key="COGS").update(is_active=False)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(missing_cogs)}/preview/")
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        self.assertFalse(preview.data["can_post"])
        ChartOfAccount.objects.filter(system_code="COGS").update(is_active=True)
        AccountingPostingProfile.objects.filter(key="COGS").update(is_active=True)

        missing_asset = self._stock_out()
        ChartOfAccount.objects.filter(system_code="INVENTORY_ASSET").update(is_active=False)
        AccountingPostingProfile.objects.filter(key="INVENTORY_ASSET").update(is_active=False)
        asset_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(missing_asset)}/preview/")
        self.assertFalse(asset_preview.data["can_post"])
        ChartOfAccount.objects.filter(system_code="INVENTORY_ASSET").update(is_active=True)
        AccountingPostingProfile.objects.filter(key="INVENTORY_ASSET").update(is_active=True)

        blocked = self._stock_out()
        blocked_id = self._candidate_id(blocked)
        blocked_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/preview/").data
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": blocked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{blocked_id}/post/", {"idempotency_key": blocked_preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

    def test_batch_post_verify_and_reconciliation_diagnostics(self):
        row = self._stock_out()
        deferred = self._stock_out(cost_snapshot=False)
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F9_TEST", module="ACCOUNTING_BRIDGE", date_from=row.movement_date, date_to=row.movement_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="StockLedger", source_id=str(row.id), exception_code="STOCK_LEDGER_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="StockLedger", source_id=str(deferred.id), exception_code="DEFERRED_COGS").exists())
        ReconciliationItem.objects.filter(run=run, source_type="StockLedger", source_id=str(row.id), exception_code="STOCK_LEDGER_MISSING_ACCOUNTING_BRIDGE_POSTING").update(status=ReconciliationItemStatus.RESOLVED)
        candidate_id = self._candidate_id(row)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        item_id = batch_post.data["posted"][0]["reconciliation_item"]["id"]
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=item_id).status, ReconciliationItemStatus.MATCHED)
