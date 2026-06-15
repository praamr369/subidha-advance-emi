from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, ChartOfAccount, DocumentSequence, JournalEntry, JournalEntryType
from accounting.services.document_sequence_service import DocumentType
from accounting.services.journal_posting_service import create_journal_entry, post_journal_entry
from billing.models import (
    BillingChannel,
    BillingCreditNote,
    BillingDocumentStatus,
    BillingInvoice,
    BillingInvoiceType,
    BillingSourceType,
    DirectSale,
    DirectSaleLine,
    DirectSaleReturn,
    DirectSaleReturnStatus,
)
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user, create_product


class AccountingBridgeCreditNoteReturnPostingPhaseF4Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f4_credit_admin", phone="9304900401")
        self.cashier = create_cashier_user(username="phase_f4_credit_cashier", phone="9304900402")
        self.customer_user = create_customer_user(username="phase_f4_credit_customer", phone="9304900403")
        self.customer = create_customer_profile(user=self.customer_user, phone="9304900403")
        self.product = create_product(name="Phase F4 Sofa", product_code="F4-SOFA", base_price=Decimal("1180.00"))
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.invoice_sequence = DocumentSequence.objects.create(series_code="F4_BILL_INV", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F4-INV", next_number=1)
        self.sale_sequence = DocumentSequence.objects.create(series_code="F4_DS", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F4-SALE", next_number=1)
        self.credit_sequence = DocumentSequence.objects.create(series_code="F4_CN", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F4-CN", next_number=1)

    def _direct_sale(self, *, sale_no="F4-SALE-001", taxable=Decimal("1000.00"), tax=Decimal("180.00")):
        total = taxable + tax
        sale = DirectSale.objects.create(
            sale_no=sale_no,
            sale_date=self.today,
            financial_year=str(self.env["financial_year"].code).replace("FY", ""),
            doc_series=self.sale_sequence,
            customer=self.customer,
            status="INVOICED",
            tax_mode="GST" if tax else "NON_GST",
            tax_calculation_mode="GST_EXCLUSIVE" if tax else "NON_GST",
            customer_gst_type="UNREGISTERED_CONSUMER",
            subtotal=taxable,
            discount_total=Decimal("0.00"),
            taxable_total=taxable,
            tax_total=tax,
            grand_total=total,
            received_total=Decimal("0.00"),
            balance_total=total,
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )
        DirectSaleLine.objects.create(
            direct_sale=sale,
            product=self.product,
            description="Phase F4 sale line",
            quantity=Decimal("1.000"),
            unit_price=taxable,
            discount_amount=Decimal("0.00"),
            taxable_value=taxable,
            gst_rate=Decimal("18.00") if tax else Decimal("0.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            igst_amount=tax,
            line_total=total,
        )
        return sale

    def _invoice(self, *, document_no="F4-INV-001", direct_sale=None, taxable=Decimal("1000.00"), tax=Decimal("180.00")):
        total = taxable + tax
        return BillingInvoice.objects.create(
            document_no=document_no,
            invoice_date=self.today,
            financial_year=str(self.env["financial_year"].code).replace("FY", ""),
            document_type=BillingInvoiceType.INVOICE,
            doc_series=self.invoice_sequence,
            customer=self.customer,
            direct_sale=direct_sale,
            billing_channel=BillingChannel.RETAIL,
            source_type=BillingSourceType.DIRECT_SALE,
            source_reference=document_no,
            tax_mode="GST" if tax else "NON_GST",
            status=BillingDocumentStatus.APPROVED,
            subtotal=taxable,
            discount_total=Decimal("0.00"),
            taxable_total=taxable,
            tax_total=tax,
            grand_total=total,
            received_total=Decimal("0.00"),
            balance_total=total,
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def _credit_note(self, *, note_no="F4-CN-001", status_value=BillingDocumentStatus.APPROVED, stock_effect=False, taxable=Decimal("1000.00"), tax=Decimal("180.00")):
        return BillingCreditNote.objects.create(
            note_no=note_no,
            note_date=self.today,
            doc_series=self.credit_sequence,
            original_invoice=self._invoice(document_no=f"INV-FOR-{note_no}", taxable=taxable, tax=tax),
            reason="Phase F4 test credit note",
            stock_effect=stock_effect,
            taxable_adjustment=taxable,
            tax_adjustment=tax,
            total_adjustment=taxable + tax,
            status=status_value,
        )

    def _direct_sale_return(self, *, return_no="F4-RET-001", status_value=DirectSaleReturnStatus.APPROVED, taxable=Decimal("1000.00"), tax=Decimal("180.00"), approved=True):
        sale = self._direct_sale(sale_no=f"SALE-FOR-{return_no}", taxable=taxable, tax=tax)
        invoice = self._invoice(document_no=f"INV-FOR-{return_no}", direct_sale=sale, taxable=taxable, tax=tax)
        return DirectSaleReturn.objects.create(
            return_no=return_no,
            direct_sale=sale,
            original_invoice=invoice,
            customer=self.customer,
            status=status_value,
            return_kind="DELIVERED_RETURN",
            reason="Phase F4 test direct sale return",
            subtotal=taxable,
            tax_total=tax,
            grand_total=taxable + tax,
            exchange_amount_due=Decimal("0.00"),
            exchange_customer_credit=Decimal("0.00"),
            stock_effect=True,
            approved_by=self.admin if approved else None,
            approved_at=timezone.now() if approved else None,
        )

    def _credit_candidate_id(self, note, event_key="credit_note_issue"):
        return f"billingcreditnote:{note.id}:{event_key}"

    def _return_candidate_id(self, row, event_key="direct_sale_return"):
        return f"directsalereturn:{row.id}:{event_key}"

    def _credit_snapshot(self, note):
        note.refresh_from_db()
        return {"note_no": note.note_no, "status": note.status, "taxable_adjustment": note.taxable_adjustment, "tax_adjustment": note.tax_adjustment, "total_adjustment": note.total_adjustment, "posted_journal_entry_id": note.posted_journal_entry_id}

    def _return_snapshot(self, row):
        row.refresh_from_db()
        return {"return_no": row.return_no, "status": row.status, "subtotal": row.subtotal, "tax_total": row.tax_total, "grand_total": row.grand_total, "approved_at": row.approved_at, "posted_at": row.posted_at, "credit_note_id": row.credit_note_id}

    def test_candidate_generation_for_concrete_billing_credit_note(self):
        note = self._credit_note(note_no="F4-CN-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingCreditNote")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == note.id)
        self.assertEqual(row["source_model"], "BillingCreditNote")
        self.assertEqual(row["event_key"], "credit_note_issue")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_preview_is_read_only_and_includes_tax_reversal_line(self):
        note = self._credit_note(note_no="F4-CN-TAX")
        before = {"note": self._credit_snapshot(note), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._credit_candidate_id(note)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "BillingCreditNote")
        self.assertEqual(response.data["total_debit"], "1180.00")
        self.assertEqual(response.data["total_credit"], "1180.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        after = {"note": self._credit_snapshot(note), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_credit_note(self):
        note = self._credit_note(note_no="F4-CN-POST")
        before_note = self._credit_snapshot(note)
        candidate_id = self._credit_candidate_id(note)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F4 credit note test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="BillingCreditNote", source_id=str(note.id), purpose="CREDIT_NOTE_ISSUE").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "BillingCreditNote")
        self.assertEqual(journal.source_id, str(note.id))
        self.assertEqual(journal.voucher_type, "CREDIT_NOTE_ISSUE")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="BillingCreditNote", source_id=str(note.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._credit_snapshot(note), before_note)

    def test_direct_sale_return_candidate_generation_and_id_shape(self):
        row = self._direct_sale_return(return_no="F4-RET-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=DirectSaleReturn")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        payload = next(item for item in response.data["results"] if item.get("source_pk") == row.id)
        self.assertEqual(payload["source_model"], "DirectSaleReturn")
        self.assertEqual(payload["bridge_candidate_id"], self._return_candidate_id(row))
        self.assertEqual(payload["event_key"], "direct_sale_return")
        self.assertEqual(payload["status"], "READY_UNPOSTED")
        self.assertEqual(payload["return_number"], row.return_no)
        self.assertEqual(payload["return_status"], DirectSaleReturnStatus.APPROVED)
        self.assertEqual(payload["taxable_amount"], "1000.00")
        self.assertEqual(payload["tax_amount"], "180.00")
        self.assertTrue(payload["can_preview"])
        self.assertTrue(payload["can_post"])

    def test_direct_sale_return_preview_is_read_only_balanced_and_tax_line_controlled(self):
        row = self._direct_sale_return(return_no="F4-RET-PREVIEW")
        before = {"return": self._return_snapshot(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._return_candidate_id(row)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "DirectSaleReturn")
        self.assertEqual(response.data["total_debit"], "1180.00")
        self.assertEqual(response.data["total_credit"], "1180.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        after = {"return": self._return_snapshot(row), "journals": JournalEntry.objects.count(), "bridge": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

        no_tax = self._direct_sale_return(return_no="F4-RET-NOTAX", tax=Decimal("0.00"))
        no_tax_preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._return_candidate_id(no_tax)}/preview/")
        self.assertEqual(no_tax_preview.status_code, status.HTTP_200_OK, no_tax_preview.data)
        self.assertFalse(no_tax_preview.data["tax_lines"])

    def test_direct_sale_return_post_idempotency_verify_and_no_source_mutation(self):
        row = self._direct_sale_return(return_no="F4-RET-POST")
        before_return = self._return_snapshot(row)
        candidate_id = self._return_candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F4 return test"}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(first.data["journal_entry"]["id"], second.data["journal_entry"]["id"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="DirectSaleReturn", source_id=str(row.id), purpose="DIRECT_SALE_RETURN").count(), 1)
        self.assertEqual(JournalEntry.objects.filter(source_model="DirectSaleReturn", source_id=str(row.id), voucher_type="DIRECT_SALE_RETURN").count(), 1)
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="DirectSaleReturn", source_id=str(row.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._return_snapshot(row), before_return)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_direct_sale_return_non_admin_locked_missing_numbering_mapping_and_unsupported_reject(self):
        row = self._direct_sale_return(return_no="F4-RET-BLOCK")
        candidate_id = self._return_candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.client.force_authenticate(user=self.admin)
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])

        ChartOfAccount.objects.filter(system_code="OUTPUT_GST").update(is_active=False)
        blocked_mapping = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/")
        self.assertEqual(blocked_mapping.status_code, status.HTTP_200_OK, blocked_mapping.data)
        self.assertFalse(blocked_mapping.data["can_post"])
        self.assertTrue(any("OUTPUT_GST" in item for item in blocked_mapping.data["blockers"] + blocked_mapping.data["warnings"]))
        ChartOfAccount.objects.filter(system_code="OUTPUT_GST").update(is_active=True)

        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)
        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=True)

        draft = self._direct_sale_return(return_no="F4-RET-DRAFT", status_value=DirectSaleReturnStatus.DRAFT, approved=False)
        draft_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._return_candidate_id(draft)}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(draft_post.status_code, status.HTTP_400_BAD_REQUEST)
        cancelled = self._direct_sale_return(return_no="F4-RET-CANCEL", status_value=DirectSaleReturnStatus.CANCELLED, approved=False)
        cancelled_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._return_candidate_id(cancelled, 'credit_return_skipped_not_applicable')}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(cancelled_post.status_code, status.HTTP_400_BAD_REQUEST)

    def test_direct_sale_return_batch_preview_post_and_date_filtering(self):
        row = self._direct_sale_return(return_no="F4-RET-BATCH")
        candidate_id = self._return_candidate_id(row)
        filtered = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/?source_model=DirectSaleReturn&date_from={self.today.isoformat()}&date_to={self.today.isoformat()}")
        self.assertEqual(filtered.status_code, status.HTTP_200_OK, filtered.data)
        self.assertTrue(any(item.get("source_pk") == row.id for item in filtered.data["results"]))
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        self.assertEqual(batch_post.data["posted_count"], 1)

    def test_reconciliation_run_reports_direct_sale_return_unposted_posted_mismatch_unbalanced_and_duplicate(self):
        row = self._direct_sale_return(return_no="F4-RET-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_RETURN_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="DirectSaleReturn", source_id=str(row.id), exception_code="DIRECT_SALE_RETURN_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._return_candidate_id(row)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        journal = JournalEntry.objects.get(pk=post_response.data["journal_entry"]["id"])
        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_RETURN_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="DirectSaleReturn", source_id=str(row.id), exception_code="POSTED_UNVERIFIED").exists())

        first_debit = journal.lines.filter(debit_amount__gt=0).first()
        # JournalEntryLine is immutable once posted — bypass guard to simulate amount mismatch.
        journal.lines.filter(pk=first_debit.pk).update(debit_amount=Decimal("999.00"))
        first_debit.refresh_from_db()
        run3 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_RETURN_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run3, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run3, source_type="DirectSaleReturn", source_id=str(row.id), exception_code="JOURNAL_UNBALANCED").exists())

        journal.lines.filter(pk=first_debit.pk).update(debit_amount=Decimal("1000.00"))
        first_debit.refresh_from_db()
        bridge = AccountingBridgePosting.objects.get(source_model="DirectSaleReturn", source_id=str(row.id), purpose="DIRECT_SALE_RETURN")
        bridge.source_id = "999999"
        bridge.save(update_fields=["source_id", "updated_at"])
        run4 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_RETURN_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run4, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run4, source_type="AccountingBridgePosting", exception_code="BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE").exists())

        bridge.source_id = str(row.id)
        bridge.save(update_fields=["source_id", "updated_at"])
        lines = [{"chart_account": line.chart_account, "description": line.description, "debit_amount": line.debit_amount, "credit_amount": line.credit_amount} for line in journal.lines.all()]
        duplicate = create_journal_entry(entry_date=self.today, entry_type=JournalEntryType.SYSTEM_BRIDGE, memo="Duplicate return source test", source_model="DirectSaleReturn", source_id=str(row.id), voucher_type="DIRECT_SALE_RETURN", source_type="DELIVERED_RETURN", source_reference=row.return_no, lines=lines)
        post_journal_entry(journal_entry_id=duplicate.id, posted_by=self.admin)
        run5 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_RETURN_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run5, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run5, source_type="DirectSaleReturn", source_id=str(row.id), exception_code="DUPLICATE_JOURNAL_SOURCE_REFERENCE").exists())

    def test_same_key_idempotent_different_key_rejects_for_credit_note_and_sales_return_classification(self):
        note = self._credit_note(note_no="F4-CN-IDEMP")
        sale_return_note = self._credit_note(note_no="F4-CN-RET", stock_effect=True)
        sale_return_row = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingCreditNote&event_key=sales_return")
        self.assertEqual(sale_return_row.status_code, status.HTTP_200_OK, sale_return_row.data)
        self.assertTrue(any(item.get("source_pk") == sale_return_note.id for item in sale_return_row.data["results"]))
        candidate_id = self._credit_candidate_id(note)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="BillingCreditNote", source_id=str(note.id)).count(), 1)

    def test_reconciliation_run_reports_unposted_posted_and_amount_mismatch_credit_note(self):
        note = self._credit_note(note_no="F4-CN-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="BillingCreditNote", source_id=str(note.id), exception_code="BILLING_CREDIT_NOTE_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        candidate_id = self._credit_candidate_id(note)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        journal = JournalEntry.objects.get(pk=post_response.data["journal_entry"]["id"])
        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="BillingCreditNote", source_id=str(note.id), exception_code="POSTED_UNVERIFIED").exists())
        first_debit = journal.lines.filter(debit_amount__gt=0).first()
        # JournalEntryLine is immutable once posted — bypass guard to simulate amount mismatch.
        journal.lines.filter(pk=first_debit.pk).update(debit_amount=Decimal("999.00"))
        first_debit.refresh_from_db()
        run3 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run3, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run3, source_type="BillingCreditNote", source_id=str(note.id), exception_code="JOURNAL_UNBALANCED").exists())
