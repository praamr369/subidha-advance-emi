from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from accounting.services.accounting_bridge_customer_advance_application_service import BridgeCandidateFilters, list_bridge_candidates
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import CustomerAdvanceAllocation, Payment
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class AccountingBridgeCustomerAdvanceApplicationPhaseF21Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f21_admin", phone="9305210001")
        self.cashier = create_cashier_user(username="phase_f21_cashier", phone="9305210002")
        self.customer = create_customer_profile(name="F21 Customer", phone="7305210001")
        self.product = create_product(name="F21 Product", product_code="F21-PROD", base_price=Decimal("9600.00"))
        self.batch = create_batch(batch_code="F21BATCH", duration_months=12, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=21)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("9600.00"), monthly_amount=Decimal("800.00"), tenure_months=12)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("800.00"), due_date=date(2026, 5, 21))
        self._allocation_month_no = 1
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]
        self.client.force_authenticate(user=self.admin)

    def _advance(self, *, amount=Decimal("500.00"), suffix="001"):
        return CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=amount, collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no=f"F21-ADV-{suffix}", payment_date=self.today, idempotency_key=f"f21-advance-{suffix}")

    def _allocation(self, *, amount=Decimal("500.00"), suffix="001"):
        advance = self._advance(amount=amount, suffix=suffix)
        if self._allocation_month_no == 1:
            emi = self.emi
        else:
            emi = create_emi(
                subscription=self.subscription,
                month_no=self._allocation_month_no,
                amount=Decimal("800.00"),
                due_date=date(2026, 5, 20 + self._allocation_month_no),
            )
        self._allocation_month_no += 1
        result = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=emi.id, amount=amount, allocated_by=self.admin, reference_no=f"F21-ALLOC-{suffix}", allocation_date=self.today)
        return result["allocation"]

    def _candidate_id(self, allocation):
        return f"customeradvanceallocation:{allocation.id}:customer_advance_application"

    def _snapshot(self, allocation):
        allocation.refresh_from_db()
        allocation.advance.refresh_from_db()
        allocation.payment.refresh_from_db()
        allocation.emi.refresh_from_db()
        allocation.subscription.refresh_from_db()
        allocation.subscription.customer.refresh_from_db()
        allocation.advance.finance_account.refresh_from_db()
        return {
            "allocation": {"advance_id": allocation.advance_id, "subscription_id": allocation.subscription_id, "emi_id": allocation.emi_id, "payment_id": allocation.payment_id, "amount": allocation.amount, "allocated_by_id": allocation.allocated_by_id, "allocation_date": allocation.allocation_date, "notes": allocation.notes},
            "advance": {"amount": allocation.advance.amount, "unapplied_amount": allocation.advance.unapplied_amount, "status": allocation.advance.status, "metadata": allocation.advance.allocation_metadata},
            "payment": {"amount": allocation.payment.amount, "reference_no": allocation.payment.reference_no, "metadata": allocation.payment.allocation_metadata, "payment_date": allocation.payment.payment_date},
            "emi": {"status": allocation.emi.status, "amount": allocation.emi.amount},
            "subscription": {"status": allocation.subscription.status},
            "customer": {"name": allocation.subscription.customer.name, "phone": allocation.subscription.customer.phone},
            "finance_account": {"is_active": allocation.advance.finance_account.is_active, "chart_account_id": allocation.advance.finance_account.chart_account_id},
        }

    def _post_allocation(self, allocation):
        candidate_id = self._candidate_id(allocation)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        response = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F21_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def test_customer_advance_allocation_candidate_generation_and_f1_exclusion(self):
        allocation = self._allocation(suffix="CAND")
        rows = list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceAllocation"))
        row = next(item for item in rows if int(item["source_pk"]) == allocation.id)
        self.assertEqual(row["source_model"], "CustomerAdvanceAllocation")
        self.assertEqual(row["event_key"], "customer_advance_application")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertTrue(row["can_post"])
        self.assertEqual(row["advance_reference"], allocation.advance.reference_no)
        self.assertEqual(row["linked_payment_id"], allocation.payment_id)
        payment_rows = list_bridge_candidates(BridgeCandidateFilters(source_model="Payment"))
        payment_row = next(item for item in payment_rows if str(item.get("source_id")) == str(allocation.payment_id))
        self.assertEqual(payment_row["event_key"], "payment_skipped_not_applicable")
        self.assertFalse(payment_row["can_post"])

    def test_preview_read_only_balanced_without_cash_revenue_or_gst(self):
        allocation = self._allocation(suffix="PREVIEW")
        before = {"snapshot": self._snapshot(allocation), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(allocation)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "CustomerAdvanceAllocation")
        self.assertEqual(response.data["total_debit"], "500.00")
        self.assertEqual(response.data["total_credit"], "500.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertFalse(response.data.get("tax_lines"))
        descriptions = " ".join(line["description"].lower() for line in response.data["lines"])
        self.assertIn("customer advance application", descriptions)
        self.assertNotIn("cash", descriptions)
        self.assertNotIn("revenue", descriptions)
        self.assertNotIn("gst", descriptions)
        after = {"snapshot": self._snapshot(allocation), "journals": JournalEntry.objects.count(), "bridges": AccountingBridgePosting.objects.count(), "items": ReconciliationItem.objects.count(), "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number}
        self.assertEqual(after, before)

    def test_post_idempotent_pending_verify_and_no_source_mutation(self):
        allocation = self._allocation(suffix="POST")
        before = self._snapshot(allocation)
        candidate_id = self._candidate_id(allocation)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertTrue(first.data["posted"])
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="CustomerAdvanceAllocation", source_id=str(allocation.id), purpose="CUSTOMER_ADVANCE_APPLICATION").count(), 1)
        item = ReconciliationItem.objects.get(source_type="CustomerAdvanceAllocation", source_id=str(allocation.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(allocation), before)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{item.id}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        item.refresh_from_db()
        self.assertEqual(item.status, ReconciliationItemStatus.MATCHED)

    def test_f2_and_f20_paths_remain_separate(self):
        allocation = self._allocation(suffix="SEP")
        receipt = ReceiptDocument.objects.create(receipt_no="F21-RCT-ADV", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=self.today, finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.MANUAL, amount=Decimal("300.00"))
        f21_rows = list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceAllocation"))
        self.assertTrue(any(int(row["source_pk"]) == allocation.id for row in f21_rows))
        self.assertFalse(any(row.get("source_model") == "CustomerAdvance" for row in f21_rows))
        receipt_rows = list_bridge_candidates(BridgeCandidateFilters(source_model="ReceiptDocument"))
        self.assertTrue(any(row.get("source_model") == "ReceiptDocument" and row.get("event_key") == "customer_advance" and str(row.get("source_pk")) == str(receipt.id) for row in receipt_rows))

    def test_mapping_numbering_period_and_non_admin_blockers(self):
        allocation = self._allocation(suffix="BLOCK")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=False)
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceAllocation")) if int(item["source_pk"]) == allocation.id)
        self.assertEqual(row["status"], "BLOCKED_BY_MAPPING")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=True)
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        row = next(item for item in list_bridge_candidates(BridgeCandidateFilters(source_model="CustomerAdvanceAllocation")) if int(item["source_pk"]) == allocation.id)
        self.assertEqual(row["status"], "BLOCKED_BY_NUMBERING")
        self.client.force_authenticate(user=self.cashier)
        post = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(allocation)}/post/", {"idempotency_key": row["idempotency_key"], "confirm": True}, format="json")
        self.assertIn(post.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_batch_preview_post_and_diagnostics(self):
        allocation = self._allocation(suffix="BATCH")
        candidate_id = self._candidate_id(allocation)
        preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        key = preview.data["previews"][0]["idempotency_key"]
        post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(post.status_code, status.HTTP_200_OK, post.data)
        posted_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=posted_run, source_type="CustomerAdvanceAllocation", source_id=str(allocation.id), exception_code="CUSTOMER_ADVANCE_APPLICATION_POSTED_UNVERIFIED").exists())

        missing = self._allocation(suffix="MISSING")
        before_journals = JournalEntry.objects.count()
        before_bridges = AccountingBridgePosting.objects.count()
        missing_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=missing_run, source_type="CustomerAdvanceAllocation", source_id=str(missing.id), exception_code="CUSTOMER_ADVANCE_APPLICATION_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())
        self.assertEqual(JournalEntry.objects.count(), before_journals)
        self.assertEqual(AccountingBridgePosting.objects.count(), before_bridges)

        amount = self._allocation(suffix="AMOUNT")
        self._post_allocation(amount)
        amount_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceAllocation", source_id=str(amount.id), purpose="CUSTOMER_ADVANCE_APPLICATION").journal_entry
        for line in amount_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("200.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("200.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=amount_run, source_type="CustomerAdvanceAllocation", source_id=str(amount.id), exception_code="CUSTOMER_ADVANCE_APPLICATION_AMOUNT_MISMATCH").exists())

        broken = self._allocation(suffix="LINK")
        self._post_allocation(broken)
        broken_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceAllocation", source_id=str(broken.id), purpose="CUSTOMER_ADVANCE_APPLICATION").journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="broken-source")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code="CUSTOMER_ADVANCE_APPLICATION_SOURCE_LINK_MISSING").exists())

        unbalanced = self._allocation(suffix="UNBAL")
        self._post_allocation(unbalanced)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceAllocation", source_id=str(unbalanced.id), purpose="CUSTOMER_ADVANCE_APPLICATION").journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("299.00"))
        unbalanced_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=unbalanced_run, source_type="CustomerAdvanceAllocation", source_id=str(unbalanced.id), exception_code="CUSTOMER_ADVANCE_APPLICATION_JOURNAL_UNBALANCED").exists())

        duplicate = self._allocation(suffix="DUP")
        self._post_allocation(duplicate)
        original = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceAllocation", source_id=str(duplicate.id), purpose="CUSTOMER_ADVANCE_APPLICATION").journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate test", source_model="CustomerAdvanceAllocation", source_id=str(duplicate.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="CustomerAdvanceAllocation", source_id=str(duplicate.id), exception_code="CUSTOMER_ADVANCE_APPLICATION_DUPLICATE_ACCOUNTING_BRIDGE_POSTING").exists())
