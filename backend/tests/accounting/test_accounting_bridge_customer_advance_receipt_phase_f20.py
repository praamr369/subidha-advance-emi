from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, DocumentSequence, FinanceAccount, JournalEntry, JournalEntryStatus, JournalEntryType
from accounting.services.accounting_bridge_customer_advance_receipt_service import BridgeCandidateFilters, list_bridge_candidates
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import CustomerAdvance, CustomerAdvanceAllocation, Payment
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class AccountingBridgeCustomerAdvanceReceiptPhaseF20Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f20_admin", phone="9305200001")
        self.cashier = create_cashier_user(username="phase_f20_cashier", phone="9305200002")
        self.customer = create_customer_profile(name="F20 Customer", phone="7305200001")
        self.product = create_product(name="F20 Product", product_code="F20-PROD", base_price=Decimal("2400.00"))
        self.batch = create_batch(batch_code="F20BATCH", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=20)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("2400.00"), monthly_amount=Decimal("800.00"), tenure_months=3)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("800.00"), due_date=date(2026, 5, 20))
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

    def _advance(self, *, amount=Decimal("500.00"), suffix="001"):
        return CustomerAdvanceService.collect_unapplied_advance(
            customer_id=self.customer.id,
            amount=amount,
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            method="CASH",
            reference_no=f"F20-ADV-{suffix}",
            payment_date=self.today,
            idempotency_key=f"f20-advance-{suffix}",
        )

    def _candidate_id(self, advance):
        return f"customeradvance:{advance.id}:customer_advance_receipt"

    def _snapshot(self, advance):
        advance.refresh_from_db()
        advance.customer.refresh_from_db()
        advance.finance_account.refresh_from_db()
        return {
            "advance": {
                "amount": advance.amount,
                "unapplied_amount": advance.unapplied_amount,
                "status": advance.status,
                "method": advance.method,
                "reference_no": advance.reference_no,
                "payment_date": advance.payment_date,
                "finance_account_id": advance.finance_account_id,
                "allocation_metadata": advance.allocation_metadata,
            },
            "customer": {"name": advance.customer.name, "phone": advance.customer.phone},
            "finance_account": {"is_active": advance.finance_account.is_active, "chart_account_id": advance.finance_account.chart_account_id},
            "allocations": CustomerAdvanceAllocation.objects.count(),
            "payments": Payment.objects.count(),
            "receipts": ReceiptDocument.objects.count(),
        }

    def _post_advance(self, advance):
        candidate_id = self._candidate_id(advance)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F20_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def test_customer_advance_receipt_candidate_generation(self):
        advance = self._advance(suffix="CAND")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CustomerAdvance")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == advance.id)
        self.assertEqual(row["source_model"], "CustomerAdvance")
        self.assertEqual(row["event_key"], "customer_advance_receipt")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertTrue(row["can_post"])
        self.assertEqual(row["advance_reference"], advance.reference_no)
        self.assertEqual(row["customer_name"], self.customer.name)
        self.assertEqual(row["finance_account_name"], self.finance_account.name)
        self.assertIn("customer_advance_receipt_ready_unposted_count", response.data["summary"])

    def test_preview_read_only_balanced_and_no_revenue_receivable_gst_lines(self):
        advance = self._advance(suffix="PREVIEW")
        before = {"snapshot": self._snapshot(advance), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(advance)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "CustomerAdvance")
        self.assertEqual(response.data["total_debit"], "500.00")
        self.assertEqual(response.data["total_credit"], "500.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertFalse(response.data.get("tax_lines"))
        self.assertIn("does not edit customer advance", response.data["safety_text"])
        descriptions = " ".join(line["description"].lower() for line in response.data["lines"])
        self.assertIn("customer advance", descriptions)
        self.assertNotIn("revenue", descriptions)
        self.assertNotIn("receivable", descriptions)
        after = {"snapshot": self._snapshot(advance), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        advance = self._advance(suffix="POST")
        before = self._snapshot(advance)
        candidate_id = self._candidate_id(advance)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="CustomerAdvance", source_id=str(advance.id), purpose="CUSTOMER_ADVANCE_RECEIPT").count(), 1)
        item = ReconciliationItem.objects.get(source_type="CustomerAdvance", source_id=str(advance.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(advance), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_f2_receiptdocument_customer_advance_is_not_duplicated(self):
        receipt = ReceiptDocument.objects.create(receipt_no="F20-RCT-ADV", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=self.today, finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.MANUAL, amount=Decimal("300.00"))
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CustomerAdvance")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(any(row.get("source_model") == "ReceiptDocument" for row in response.data["results"]))
        receipt_response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=ReceiptDocument")
        self.assertTrue(any(row.get("source_model") == "ReceiptDocument" and row.get("event_key") == "customer_advance" and str(row.get("source_pk")) == str(receipt.id) for row in receipt_response.data["results"]))

    def test_advance_allocation_payment_remains_excluded_from_f1(self):
        advance = self._advance(amount=Decimal("500.00"), suffix="ALLOC")
        result = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("500.00"), allocated_by=self.admin, reference_no="F20-ALLOC-PAY", allocation_date=self.today)
        payment = result["payment"]
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="Payment"))
        row = next(item for item in rows if str(item.get("source_id")) == str(payment.id))
        self.assertEqual(row["event_key"], "payment_skipped_not_applicable")
        self.assertFalse(row["can_post"])
        run = self._run_checks()
        self.assertFalse(ReconciliationItem.objects.filter(run=run, source_type="Payment", source_id=str(payment.id), exception_code="PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

    def test_mapping_finance_numbering_and_non_admin_blockers(self):
        advance = self._advance(suffix="BLOCK")
        FinanceAccount.objects.filter(pk=self.finance_account.pk).update(is_active=False)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CustomerAdvance")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == advance.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        finance_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=finance_run, source_type="CustomerAdvance", source_id=str(advance.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_FINANCE_ACCOUNT_INACTIVE").exists())

        FinanceAccount.objects.filter(pk=self.finance_account.pk).update(is_active=True)
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=False)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CustomerAdvance")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == advance.id)
        self.assertEqual(row["status"], "BLOCKED_BY_MAPPING")
        mapping_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=mapping_run, source_type="CustomerAdvance", source_id=str(advance.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_MAPPING_MISSING").exists())

        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=True)
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=CustomerAdvance")
        row = next(item for item in response.data["results"] if int(item["source_pk"]) == advance.id)
        self.assertEqual(row["status"], "BLOCKED_BY_NUMBERING")
        numbering_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=numbering_run, source_type="CustomerAdvance", source_id=str(advance.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_NUMBERING_MISSING").exists())

        self.client.force_authenticate(user=self.cashier)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(advance)}/post/", {"idempotency_key": row["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_batch_preview_and_post(self):
        advance = self._advance(suffix="BATCH")
        candidate_id = self._candidate_id(advance)
        preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        self.assertEqual(preview.data["postable_count"], 1)
        idempotency_key = preview.data["previews"][0]["idempotency_key"]
        post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: idempotency_key}, "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)
        self.assertEqual(post.data["posted_count"], 1)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="CustomerAdvance", source_id=str(advance.id), purpose="CUSTOMER_ADVANCE_RECEIPT").count(), 1)

    def test_legacy_or_receiptdocument_owned_advance_is_not_f20_postable(self):
        legacy = CustomerAdvance.objects.create(customer=self.customer, finance_account=self.finance_account, amount=Decimal("100.00"), unapplied_amount=Decimal("100.00"), method="CASH", reference_no="F20-LEGACY", payment_date=self.today, collected_by=self.admin)
        receipt_owned = CustomerAdvance.objects.create(customer=self.customer, finance_account=self.finance_account, amount=Decimal("100.00"), unapplied_amount=Decimal("100.00"), method="CASH", reference_no="F20-RCT-OWNED", payment_date=self.today, allocation_metadata={"source_model": "ReceiptDocument", "receipt_document_id": 99}, collected_by=self.admin)
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvance"))
        by_id = {int(row["source_pk"]): row for row in rows}
        self.assertEqual(by_id[legacy.id]["status"], "UNSUPPORTED_SOURCE")
        self.assertEqual(by_id[receipt_owned.id]["status"], "SKIPPED_NOT_APPLICABLE")
        self.assertFalse(by_id[legacy.id]["can_post"])
        self.assertFalse(by_id[receipt_owned.id]["can_post"])
        run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="CustomerAdvance", source_id=str(legacy.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_UNSUPPORTED_SOURCE").exists())
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="CustomerAdvance", source_id=str(receipt_owned.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_DUPLICATE_F2_RECEIPTDOCUMENT_RISK").exists())

    def test_reconciliation_run_reports_f20_states_and_no_source_mutation(self):
        missing = self._advance(suffix="RUN-MISSING")
        before_missing = self._snapshot(missing)
        before_journals = JournalEntry.objects.count()
        before_bridges = AccountingBridgePosting.objects.count()
        missing_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=missing_run, source_type="CustomerAdvance", source_id=str(missing.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(AccountingBridgePosting.objects.count(), before_bridges)
        self.assertEqual(self._snapshot(missing), before_missing)

        posted = self._advance(suffix="RUN-POSTED")
        self._post_advance(posted)
        posted_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=posted_run, source_type="CustomerAdvance", source_id=str(posted.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_POSTED_UNVERIFIED").exists())

        amount = self._advance(suffix="RUN-AMOUNT")
        self._post_advance(amount)
        amount_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvance", source_id=str(amount.id), purpose="CUSTOMER_ADVANCE_RECEIPT").journal_entry
        for line in amount_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("200.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("200.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=amount_run, source_type="CustomerAdvance", source_id=str(amount.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_AMOUNT_MISMATCH").exists())

        broken = self._advance(suffix="RUN-LINK")
        self._post_advance(broken)
        broken_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvance", source_id=str(broken.id), purpose="CUSTOMER_ADVANCE_RECEIPT").journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="broken-source")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code="CUSTOMER_ADVANCE_RECEIPT_SOURCE_LINK_MISSING").exists())

        unbalanced = self._advance(suffix="RUN-UNBAL")
        self._post_advance(unbalanced)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvance", source_id=str(unbalanced.id), purpose="CUSTOMER_ADVANCE_RECEIPT").journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("299.00"))
        unbalanced_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=unbalanced_run, source_type="CustomerAdvance", source_id=str(unbalanced.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_JOURNAL_UNBALANCED").exists())

        duplicate = self._advance(suffix="RUN-DUP")
        self._post_advance(duplicate)
        original = AccountingBridgePosting.objects.get(source_model="CustomerAdvance", source_id=str(duplicate.id), purpose="CUSTOMER_ADVANCE_RECEIPT").journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate test", source_model="CustomerAdvance", source_id=str(duplicate.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="CustomerAdvance", source_id=str(duplicate.id), exception_code="CUSTOMER_ADVANCE_RECEIPT_DUPLICATE_ACCOUNTING_BRIDGE_POSTING").exists())
