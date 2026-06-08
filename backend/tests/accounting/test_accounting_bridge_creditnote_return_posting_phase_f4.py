from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from billing.models import BillingChannel, BillingCreditNote, BillingDocumentStatus, BillingInvoice, BillingInvoiceType, BillingSourceType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user


class AccountingBridgeCreditNoteReturnPostingPhaseF4Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f4_credit_admin", phone="9304900401")
        self.cashier = create_cashier_user(username="phase_f4_credit_cashier", phone="9304900402")
        self.customer_user = create_customer_user(username="phase_f4_credit_customer", phone="9304900403")
        self.customer = create_customer_profile(user=self.customer_user, phone="9304900403")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.invoice_sequence = DocumentSequence.objects.create(series_code="F4_BILL_INV", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F4-INV", next_number=1)
        self.credit_sequence = DocumentSequence.objects.create(series_code="F4_CN", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F4-CN", next_number=1)

    def _invoice(self, *, document_no="F4-INV-001"):
        taxable = Decimal("1000.00")
        tax = Decimal("180.00")
        total = taxable + tax
        return BillingInvoice.objects.create(
            document_no=document_no,
            invoice_date=self.today,
            financial_year=str(self.env["financial_year"].code).replace("FY", ""),
            document_type=BillingInvoiceType.INVOICE,
            doc_series=self.invoice_sequence,
            customer=self.customer,
            billing_channel=BillingChannel.RETAIL,
            source_type=BillingSourceType.DIRECT_SALE,
            source_reference=document_no,
            tax_mode="GST",
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
            original_invoice=self._invoice(document_no=f"INV-FOR-{note_no}"),
            reason="Phase F4 test credit note",
            stock_effect=stock_effect,
            taxable_adjustment=taxable,
            tax_adjustment=tax,
            total_adjustment=taxable + tax,
            status=status_value,
        )

    def _candidate_id(self, note, event_key="credit_note_issue"):
        return f"billingcreditnote:{note.id}:{event_key}"

    def _snapshot(self, note):
        note.refresh_from_db()
        return {
            "note_no": note.note_no,
            "status": note.status,
            "taxable_adjustment": note.taxable_adjustment,
            "tax_adjustment": note.tax_adjustment,
            "total_adjustment": note.total_adjustment,
            "posted_journal_entry_id": note.posted_journal_entry_id,
        }

    def test_candidate_generation_for_concrete_billing_credit_note(self):
        note = self._credit_note(note_no="F4-CN-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingCreditNote")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == note.id)
        self.assertEqual(row["source_model"], "BillingCreditNote")
        self.assertEqual(row["event_key"], "credit_note_issue")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["taxable_amount"], "1000.00")
        self.assertEqual(row["tax_amount"], "180.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_preview_is_read_only_and_includes_tax_reversal_line(self):
        note = self._credit_note(note_no="F4-CN-TAX")
        before = {
            "note": self._snapshot(note),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(note)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "BillingCreditNote")
        self.assertEqual(response.data["total_debit"], "1180.00")
        self.assertEqual(response.data["total_credit"], "1180.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        after = {
            "note": self._snapshot(note),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_credit_note(self):
        note = self._credit_note(note_no="F4-CN-POST")
        before_note = self._snapshot(note)
        candidate_id = self._candidate_id(note)
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
        self.assertEqual(self._snapshot(note), before_note)

    def test_same_key_idempotent_different_key_rejects(self):
        note = self._credit_note(note_no="F4-CN-IDEMP")
        candidate_id = self._candidate_id(note)
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

    def test_non_admin_locked_missing_numbering_and_unsupported_reject(self):
        note = self._credit_note(note_no="F4-CN-BLOCK")
        candidate_id = self._candidate_id(note)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.client.force_authenticate(user=self.admin)
        draft = self._credit_note(note_no="F4-CN-DRAFT", status_value=BillingDocumentStatus.DRAFT)
        unsupported_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(draft, 'credit_return_skipped_not_applicable')}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
        self.assertEqual(unsupported_post.status_code, status.HTTP_400_BAD_REQUEST)

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

    def test_batch_post_verify_and_sales_return_classification(self):
        note = self._credit_note(note_no="F4-CN-BATCH")
        sale_return_note = self._credit_note(note_no="F4-CN-RET", stock_effect=True)
        sale_return_row = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingCreditNote&event_key=sales_return")
        self.assertEqual(sale_return_row.status_code, status.HTTP_200_OK, sale_return_row.data)
        self.assertTrue(any(item.get("source_pk") == sale_return_note.id for item in sale_return_row.data["results"]))

        candidate_id = self._candidate_id(note)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)
        item_id = batch_post.data["posted"][0]["reconciliation_item"]["id"]
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item_id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item = ReconciliationItem.objects.get(pk=item_id)
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_reconciliation_run_reports_unposted_posted_and_amount_mismatch_credit_note(self):
        note = self._credit_note(note_no="F4-CN-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="BillingCreditNote", source_id=str(note.id), exception_code="BILLING_CREDIT_NOTE_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._candidate_id(note)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        journal = JournalEntry.objects.get(pk=post_response.data["journal_entry"]["id"])
        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="BillingCreditNote", source_id=str(note.id), exception_code="POSTED_UNVERIFIED").exists())

        first_debit = journal.lines.filter(debit_amount__gt=0).first()
        first_debit.debit_amount = Decimal("999.00")
        first_debit.save(update_fields=["debit_amount", "updated_at"])
        run3 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F4_TEST", module="ACCOUNTING_BRIDGE", date_from=note.note_date, date_to=note.note_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run3, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run3, source_type="BillingCreditNote", source_id=str(note.id), exception_code="JOURNAL_UNBALANCED").exists())
