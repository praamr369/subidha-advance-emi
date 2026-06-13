from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, ChartOfAccountType, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from accounting.services.accounting_bridge_customer_advance_refund_service import BridgeCandidateFilters, list_bridge_candidates
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import CustomerAdvanceAllocation, Payment
from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund
from subscriptions.services.customer_advance_refund_source_contract_service import record_customer_advance_refund
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class AccountingBridgeCustomerAdvanceRefundPhaseF23Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f23_admin", phone="9305230001")
        self.cashier = create_cashier_user(username="phase_f23_cashier", phone="9305230002")
        self.customer = create_customer_profile(name="F23 Customer", phone="7305230001")
        self.product = create_product(name="F23 Product", product_code="F23-PROD", base_price=Decimal("3000.00"))
        self.batch = create_batch(batch_code="F23BATCH", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=23)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("3000.00"), monthly_amount=Decimal("1000.00"), tenure_months=3)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 6, 23))
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

    def _advance(self, *, amount=Decimal("900.00"), suffix="001"):
        return CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=amount, collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no=f"F23-ADV-{suffix}", payment_date=self.today, idempotency_key=f"f23-advance-{suffix}")

    def _refund(self, *, amount=Decimal("300.00"), suffix="001"):
        advance = self._advance(amount=Decimal("900.00"), suffix=suffix)
        return record_customer_advance_refund(customer_advance_id=advance.id, amount=amount, refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="BANK", refund_date=self.today, refund_reference_no=f"F23-REF-{suffix}", idempotency_key=f"f23-refund-{suffix}")

    def _candidate_id(self, refund):
        return f"customeradvancerefund:{refund.id}:customer_advance_refund"

    def _snapshot(self, refund):
        refund.refresh_from_db()
        refund.advance.refresh_from_db()
        refund.customer.refresh_from_db()
        refund.finance_account.refresh_from_db()
        return {
            "refund": {"customer_id": refund.customer_id, "advance_id": refund.advance_id, "finance_account_id": refund.finance_account_id, "amount": refund.amount, "refund_date": refund.refund_date, "payment_method": refund.payment_method, "status": refund.status, "idempotency_key": refund.idempotency_key, "metadata_snapshot": refund.metadata_snapshot},
            "advance": {"amount": refund.advance.amount, "unapplied_amount": refund.advance.unapplied_amount, "status": refund.advance.status, "metadata": refund.advance.allocation_metadata},
            "customer": {"name": refund.customer.name, "phone": refund.customer.phone},
            "finance_account": {"is_active": refund.finance_account.is_active, "chart_account_id": refund.finance_account.chart_account_id},
        }

    def _post_refund(self, refund):
        candidate_id = self._candidate_id(refund)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F23_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def test_customer_advance_refund_candidate_generation_and_separation(self):
        refund = self._refund(suffix="CAND")
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund"))
        row = next(item for item in rows if int(item["source_pk"]) == refund.id)
        self.assertEqual(row["source_model"], "CustomerAdvanceRefund")
        self.assertEqual(row["event_key"], "customer_advance_refund")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertTrue(row["can_post"])
        self.assertEqual(row["refund_reference"], refund.refund_reference_no)
        self.assertEqual(row["advance_reference"], refund.advance.reference_no)
        self.assertEqual(row["finance_account_name"], self.finance_account.name)
        advance_rows = list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvance"))
        self.assertTrue(all(item["source_model"] == "CustomerAdvance" for item in advance_rows))
        allocation = PaymentAllocationService.allocate_customer_advance(customer_advance_id=refund.advance.id, emi_id=self.emi.id, amount=Decimal("100.00"), allocated_by=self.admin, reference_no="F23-ALLOC-CAND", allocation_date=self.today)["allocation"]
        self.assertIsInstance(allocation, CustomerAdvanceAllocation)
        self.assertIsInstance(allocation.payment, Payment)

    def test_preview_is_read_only_balanced_and_uses_liability_to_finance_account(self):
        refund = self._refund(suffix="PREVIEW")
        before = {"snapshot": self._snapshot(refund), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(refund)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "CustomerAdvanceRefund")
        self.assertEqual(response.data["total_debit"], "300.00")
        self.assertEqual(response.data["total_credit"], "300.00")
        self.assertTrue(response.data["is_balanced"])
        descriptions = " ".join(line["description"].lower() for line in response.data["lines"])
        self.assertIn("customer advance refund", descriptions)
        self.assertIn("refund paid", descriptions)
        self.assertNotIn("revenue", descriptions)
        self.assertNotIn("gst", descriptions)
        after = {"snapshot": self._snapshot(refund), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        refund = self._refund(suffix="POST")
        before = self._snapshot(refund)
        candidate_id = self._candidate_id(refund)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="CustomerAdvanceRefund", source_id=str(refund.id), purpose="CUSTOMER_ADVANCE_REFUND").count(), 1)
        item = ReconciliationItem.objects.get(source_type="CustomerAdvanceRefund", source_id=str(refund.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(refund), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_f2_f20_f21_paths_remain_separate_and_non_admin_rejected(self):
        refund = self._refund(suffix="SEP")
        receipt = ReceiptDocument.objects.create(receipt_no="F23-RCT-ADV", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=self.today, finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.MANUAL, amount=Decimal("300.00"))
        receipt_rows = list_bridge_candidates(BridgeCandidateFilters(source_model="ReceiptDocument"))
        self.assertTrue(any(row.get("source_model") == "ReceiptDocument" and row.get("event_key") == "customer_advance" and str(row.get("source_pk")) == str(receipt.id) for row in receipt_rows))
        self.client.force_authenticate(user=self.cashier)
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund")) if int(item["source_pk"]) == refund.id)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(refund)}/post/", {"idempotency_key": row["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_mapping_finance_numbering_and_batch(self):
        refund = self._refund(suffix="BLOCK")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=False)
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund")) if int(item["source_pk"]) == refund.id)
        self.assertEqual(row["status"], "BLOCKED_BY_MAPPING")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=True)
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund")) if int(item["source_pk"]) == refund.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        active_cash = self.finance_account.chart_account
        inactive_cash = ChartOfAccount.objects.create(code="F23-INACTIVE-CASH", name="F23 Inactive Cash", account_type=ChartOfAccountType.ASSET, is_active=False)
        self.finance_account.is_active = True
        self.finance_account.chart_account = inactive_cash
        self.finance_account.save(update_fields=["is_active", "chart_account"])
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund")) if int(item["source_pk"]) == refund.id)
        self.assertEqual(row["status"], "BLOCKED_BY_FINANCE_ACCOUNT")
        self.finance_account.chart_account = active_cash
        self.finance_account.save(update_fields=["chart_account"])
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceRefund")) if int(item["source_pk"]) == refund.id)
        self.assertEqual(row["status"], "BLOCKED_BY_NUMBERING")

    def test_batch_preview_post_and_reconciliation_diagnostics(self):
        refund = self._refund(suffix="BATCH")
        candidate_id = self._candidate_id(refund)
        preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        key = preview.data["previews"][0]["idempotency_key"]
        post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)
        posted_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=posted_run, source_type="CustomerAdvanceRefund", source_id=str(refund.id), exception_code__in=["CUSTOMER_ADVANCE_REFUND_POSTED_UNVERIFIED", "POSTED_UNVERIFIED"]).exists())

        missing = self._refund(suffix="MISSING")
        missing_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=missing_run, source_type="CustomerAdvanceRefund", source_id=str(missing.id), exception_code__in=["CUSTOMER_ADVANCE_REFUND_MISSING_ACCOUNTING_BRIDGE_POSTING", "MISSING_POSTING"]).exists())

        mismatch = self._refund(suffix="AMOUNT")
        self._post_refund(mismatch)
        mismatch_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(mismatch.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        for line in mismatch_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("200.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("200.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=amount_run, source_type="CustomerAdvanceRefund", source_id=str(mismatch.id), exception_code__in=["CUSTOMER_ADVANCE_REFUND_AMOUNT_MISMATCH", "AMOUNT_MISMATCH"]).exists())

        broken = self._refund(suffix="LINK")
        self._post_refund(broken)
        broken_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(broken.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="broken-source")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code__in=["CUSTOMER_ADVANCE_REFUND_SOURCE_LINK_MISSING", "BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE"]).exists())

        unbalanced = self._refund(suffix="UNBAL")
        self._post_refund(unbalanced)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(unbalanced.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("299.00"))
        unbalanced_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=unbalanced_run, source_type="CustomerAdvanceRefund", source_id=str(unbalanced.id), exception_code__in=["CUSTOMER_ADVANCE_REFUND_JOURNAL_UNBALANCED", "JOURNAL_UNBALANCED"]).exists())

        duplicate = self._refund(suffix="DUP")
        self._post_refund(duplicate)
        original = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(duplicate.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate test", source_model="CustomerAdvanceRefund", source_id=str(duplicate.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="CustomerAdvanceRefund", source_id=str(duplicate.id), exception_code__in=["CUSTOMER_ADVANCE_REFUND_DUPLICATE_ACCOUNTING_BRIDGE_POSTING", "DUPLICATE_JOURNAL_SOURCE_REFERENCE"]).exists())
