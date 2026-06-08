from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, DocumentSequence, JournalEntry
from accounting.services.document_sequence_service import DocumentType
from billing.models import BillingChannel, BillingDocumentStatus, BillingInvoice, BillingInvoiceType, BillingSourceType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_customer_profile, create_customer_user


class AccountingBridgeBillingInvoicePostingPhaseF3Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f3_invoice_admin", phone="9304900101")
        self.cashier = create_cashier_user(username="phase_f3_invoice_cashier", phone="9304900102")
        self.customer_user = create_customer_user(username="phase_f3_invoice_customer", phone="9304900103")
        self.customer = create_customer_profile(user=self.customer_user, phone="9304900103")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.invoice_sequence = DocumentSequence.objects.create(series_code="F3_BILL_INV", financial_year=str(self.env["financial_year"].code).replace("FY", ""), financial_year_ref=self.env["financial_year"], prefix="F3-INV", next_number=1)

    def _invoice(self, *, document_no="F3-INV-001", tax_total=Decimal("0.00"), status_value=BillingDocumentStatus.APPROVED, source_type=BillingSourceType.DIRECT_SALE, document_type=BillingInvoiceType.INVOICE):
        taxable = Decimal("1000.00")
        total = taxable + tax_total
        return BillingInvoice.objects.create(
            document_no=document_no,
            invoice_date=self.today,
            financial_year=str(self.env["financial_year"].code).replace("FY", ""),
            document_type=document_type,
            doc_series=self.invoice_sequence,
            customer=self.customer,
            billing_channel=BillingChannel.RETAIL,
            source_type=source_type,
            source_reference=document_no,
            tax_mode="GST" if tax_total else "NON_GST",
            status=status_value,
            subtotal=taxable,
            discount_total=Decimal("0.00"),
            taxable_total=taxable,
            tax_total=tax_total,
            grand_total=total,
            received_total=Decimal("0.00"),
            balance_total=total,
            customer_name_snapshot=self.customer.name,
            customer_phone_snapshot=self.customer.phone,
        )

    def _candidate_id(self, invoice, event_key="direct_sale_invoice"):
        return f"billinginvoice:{invoice.id}:{event_key}"

    def _snapshot(self, invoice):
        invoice.refresh_from_db()
        return {
            "document_no": invoice.document_no,
            "status": invoice.status,
            "grand_total": invoice.grand_total,
            "taxable_total": invoice.taxable_total,
            "tax_total": invoice.tax_total,
            "balance_total": invoice.balance_total,
            "posted_journal_entry_id": invoice.posted_journal_entry_id,
        }

    def test_candidate_generation_for_concrete_billing_invoice(self):
        invoice = self._invoice(document_no="F3-INV-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=BillingInvoice")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == invoice.id)
        self.assertEqual(row["source_model"], "BillingInvoice")
        self.assertEqual(row["event_key"], "direct_sale_invoice")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["taxable_amount"], "1000.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_preview_is_read_only_and_includes_tax_line(self):
        invoice = self._invoice(document_no="F3-INV-TAX", tax_total=Decimal("180.00"))
        before = {
            "invoice": self._snapshot(invoice),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(invoice)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "BillingInvoice")
        self.assertEqual(response.data["total_debit"], "1180.00")
        self.assertEqual(response.data["total_credit"], "1180.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertTrue(response.data["tax_lines"])
        after = {
            "invoice": self._snapshot(invoice),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_invoice(self):
        invoice = self._invoice(document_no="F3-INV-POST")
        candidate_id = self._candidate_id(invoice)
        before_invoice = self._snapshot(invoice)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F3 invoice test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="BillingInvoice", source_id=str(invoice.id), purpose="DIRECT_SALE_INVOICE").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "BillingInvoice")
        self.assertEqual(journal.source_id, str(invoice.id))
        self.assertEqual(journal.voucher_type, "DIRECT_SALE_INVOICE")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="BillingInvoice", source_id=str(invoice.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(invoice), before_invoice)

    def test_same_key_idempotent_different_key_rejects(self):
        invoice = self._invoice(document_no="F3-INV-IDEMP")
        candidate_id = self._candidate_id(invoice)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(source_model="BillingInvoice", source_id=str(invoice.id)).count(), 1)

    def test_unsupported_non_admin_locked_and_missing_numbering_reject(self):
        invoice = self._invoice(document_no="F3-INV-BLOCK")
        candidate_id = self._candidate_id(invoice)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.client.force_authenticate(user=self.admin)
        unsupported = self._invoice(document_no="F3-INV-UNSUP", document_type=BillingInvoiceType.PROFORMA)
        unsupported_post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(unsupported, 'unsupported_invoice')}/post/", {"idempotency_key": "x", "confirm": True}, format="json")
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

    def test_batch_post_and_verify_invoice(self):
        invoice = self._invoice(document_no="F3-INV-BATCH")
        candidate_id = self._candidate_id(invoice)
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

    def test_reconciliation_run_reports_unposted_posted_and_amount_mismatch_invoice(self):
        invoice = self._invoice(document_no="F3-INV-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F3_TEST", module="ACCOUNTING_BRIDGE", date_from=invoice.invoice_date, date_to=invoice.invoice_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="BillingInvoice", source_id=str(invoice.id), exception_code="BILLING_INVOICE_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._candidate_id(invoice)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        post_response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        journal = JournalEntry.objects.get(pk=post_response.data["journal_entry"]["id"])
        run2 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F3_TEST", module="ACCOUNTING_BRIDGE", date_from=invoice.invoice_date, date_to=invoice.invoice_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run2, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run2, source_type="BillingInvoice", source_id=str(invoice.id), exception_code="POSTED_UNVERIFIED").exists())

        first_debit = journal.lines.filter(debit_amount__gt=0).first()
        first_debit.debit_amount = Decimal("999.00")
        first_debit.save(update_fields=["debit_amount", "updated_at"])
        run3 = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F3_TEST", module="ACCOUNTING_BRIDGE", date_from=invoice.invoice_date, date_to=invoice.invoice_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run3, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run3, source_type="BillingInvoice", source_id=str(invoice.id), exception_code="JOURNAL_UNBALANCED").exists())
