from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, AccountingPeriodStatus, ChartOfAccount, DocumentSequence, JournalEntry, Vendor
from accounting.services.document_sequence_service import DocumentType
from inventory.models import PurchaseBill, PurchaseBillStatus, PurchaseTaxMode, StockLedger, VendorBill, VendorBillStatus, VendorPayment, VendorPaymentStatus
from reconciliation.models import ReconciliationItem, ReconciliationItemStatus, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_cashier_user


class AccountingBridgeVendorPaymentPostingPhaseF7Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f7_vendor_admin", phone="9304900701")
        self.cashier = create_cashier_user(username="phase_f7_vendor_cashier", phone="9304900702")
        self.client.force_authenticate(user=self.admin)
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.vendor = Vendor.objects.create(name="F7 Vendor", phone="9898000701")

    def _bill(self, *, bill_no="F7-PB-001"):
        return PurchaseBill.objects.create(
            bill_no=bill_no,
            bill_date=self.today,
            vendor=self.vendor,
            tax_mode=PurchaseTaxMode.NON_GST,
            status=PurchaseBillStatus.APPROVED,
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            notes="F7 vendor payment bridge bill",
        )

    def _vendor_bill(self, *, bill_no="F7-VB-001"):
        return VendorBill.objects.create(
            bill_no=bill_no,
            bill_date=self.today,
            vendor=self.vendor,
            finance_account=self.env["finance_account"],
            status=VendorBillStatus.DRAFT,
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            notes="F7 vendor payment source bill",
        )

    def _payment(self, *, payment_no="F7-VP-001", amount=Decimal("500.00"), vendor_bill=None, status_value=VendorPaymentStatus.DRAFT):
        return VendorPayment.objects.create(
            payment_no=payment_no,
            payment_date=self.today,
            vendor=self.vendor,
            vendor_bill=vendor_bill,
            amount=amount,
            finance_account=self.env["finance_account"],
            status=status_value,
            reference_no=f"REF-{payment_no}",
            notes="F7 controlled bridge test",
        )

    def _candidate_id(self, payment, event_key=None):
        return f"vendorpayment:{payment.id}:{event_key or ('purchase_bill_payment' if payment.vendor_bill_id else 'vendor_payment')}"

    def _snapshot(self, payment):
        payment.refresh_from_db()
        bill = payment.vendor_bill
        if bill:
            bill.refresh_from_db()
        return {
            "payment_no": payment.payment_no,
            "payment_date": payment.payment_date,
            "vendor_id": payment.vendor_id,
            "vendor_bill_id": payment.vendor_bill_id,
            "amount": payment.amount,
            "finance_account_id": payment.finance_account_id,
            "status": payment.status,
            "posted_journal_entry_id": payment.posted_journal_entry_id,
            "reference_no": payment.reference_no,
            "notes": payment.notes,
            "vendor_bill_status": getattr(bill, "status", None),
            "vendor_bill_posted_journal_entry_id": getattr(bill, "posted_journal_entry_id", None),
            "stock_ledger_count": StockLedger.objects.count(),
        }

    def test_candidate_generation_for_concrete_vendor_payment(self):
        payment = self._payment(payment_no="F7-VP-GEN")
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=VendorPayment")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item.get("source_pk") == payment.id)
        self.assertEqual(row["source_model"], "VendorPayment")
        self.assertEqual(row["event_key"], "vendor_payment")
        self.assertEqual(row["status"], "READY_UNPOSTED")
        self.assertEqual(row["vendor_payment_number"], "F7-VP-GEN")
        self.assertEqual(row["vendor_name"], self.vendor.name)
        self.assertEqual(row["payment_method"], self.env["finance_account"].kind)
        self.assertEqual(row["amount"], "500.00")
        self.assertTrue(row["can_preview"])
        self.assertTrue(row["can_post"])

    def test_purchase_bill_payment_candidate_uses_purchase_bill_event_key(self):
        bill = self._vendor_bill(bill_no="F7-VB-LINK")
        payment = self._payment(payment_no="F7-VP-LINK", vendor_bill=bill)
        response = self.client.get("/api/v1/admin/accounting/bridge-reconciliation/?source_model=VendorPayment")
        row = next(item for item in response.data["results"] if item.get("source_pk") == payment.id)
        self.assertEqual(row["event_key"], "purchase_bill_payment")
        self.assertEqual(row["purchase_bill_number"], "F7-VB-LINK")

    def test_preview_is_read_only_balanced_and_does_not_consume_numbering(self):
        payment = self._payment(payment_no="F7-VP-PREVIEW")
        before = {
            "source": self._snapshot(payment),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        response = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(payment)}/preview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["source"]["model"], "VendorPayment")
        self.assertEqual(response.data["total_debit"], "500.00")
        self.assertEqual(response.data["total_credit"], "500.00")
        self.assertTrue(response.data["is_balanced"])
        self.assertEqual(response.data["debit_lines"][0]["debit_amount"], "500.00")
        self.assertEqual(response.data["credit_lines"][0]["credit_amount"], "500.00")
        after = {
            "source": self._snapshot(payment),
            "journals": JournalEntry.objects.count(),
            "bridge": AccountingBridgePosting.objects.count(),
            "items": ReconciliationItem.objects.count(),
            "next_number": DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number,
        }
        self.assertEqual(after, before)

    def test_post_creates_journal_bridge_pending_item_and_does_not_mutate_sources_or_stock(self):
        purchase_bill = self._bill(bill_no="F7-PB-POST")
        bill = self._vendor_bill(bill_no="F7-VB-POST")
        payment = self._payment(payment_no="F7-VP-POST", vendor_bill=bill)
        purchase_before = {"status": purchase_bill.status, "posted_journal_entry_id": purchase_bill.posted_journal_entry_id}
        before_source = self._snapshot(payment)
        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        next_before = DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number
        response = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/",
            {"idempotency_key": preview["idempotency_key"], "confirm": True, "posting_note": "F7 vendor bridge test"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["posted"])
        self.assertEqual(AccountingBridgePosting.objects.filter(source_model="VendorPayment", source_id=str(payment.id), purpose="PURCHASE_BILL_PAYMENT").count(), 1)
        journal = JournalEntry.objects.get(pk=response.data["journal_entry"]["id"])
        self.assertEqual(journal.source_model, "VendorPayment")
        self.assertEqual(journal.source_id, str(payment.id))
        self.assertEqual(journal.voucher_type, "PURCHASE_BILL_PAYMENT")
        self.assertEqual(DocumentSequence.objects.get(pk=self.env["journal_numbering_profile"].pk).next_number, next_before + 1)
        item = ReconciliationItem.objects.get(source_type="VendorPayment", source_id=str(payment.id), exception_code="POSTED_UNVERIFIED")
        self.assertEqual(item.status, ReconciliationItemStatus.NEEDS_REVIEW)
        self.assertEqual(self._snapshot(payment), before_source)
        purchase_bill.refresh_from_db()
        self.assertEqual({"status": purchase_bill.status, "posted_journal_entry_id": purchase_bill.posted_journal_entry_id}, purchase_before)

    def test_idempotency_duplicate_key_non_admin_blockers_and_verification(self):
        payment = self._payment(payment_no="F7-VP-IDEMP")
        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        payload = {"idempotency_key": preview["idempotency_key"], "confirm": True}
        first = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        second = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        duplicate = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": "different-key", "confirm": True}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertFalse(second.data["posted"])
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ReconciliationItem.objects.get(pk=first.data["reconciliation_item"]["id"]).status == ReconciliationItemStatus.MATCHED)
        verify = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/items/{first.data['reconciliation_item']['id']}/verify/", {"note": "verified"}, format="json")
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        self.assertEqual(ReconciliationItem.objects.get(pk=first.data["reconciliation_item"]["id"]).status, ReconciliationItemStatus.MATCHED)

        self.client.force_authenticate(user=self.cashier)
        non_admin = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", payload, format="json")
        self.assertIn(non_admin.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_locked_period_missing_mapping_missing_numbering_and_unsupported_reject(self):
        payment = self._payment(payment_no="F7-VP-BLOCK")
        cancelled = self._payment(payment_no="F7-VP-CANCEL", status_value=VendorPaymentStatus.CANCELLED)
        unsupported = self.client.post(
            f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{self._candidate_id(cancelled, 'vendor_payment_skipped_not_applicable')}/post/",
            {"idempotency_key": "x", "confirm": True},
            format="json",
        )
        self.assertEqual(unsupported.status_code, status.HTTP_400_BAD_REQUEST)
        candidate_id = self._candidate_id(payment)
        preview = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/").data
        self.env["accounting_period"].status = AccountingPeriodStatus.LOCKED
        self.env["accounting_period"].is_locked = True
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])
        locked = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.env["accounting_period"].status = AccountingPeriodStatus.OPEN
        self.env["accounting_period"].is_locked = False
        self.env["accounting_period"].save(update_fields=["status", "is_locked", "updated_at"])

        ChartOfAccount.objects.filter(system_code="ACCOUNTS_PAYABLE").update(is_active=False)
        missing_mapping = self.client.get(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/")
        self.assertEqual(missing_mapping.status_code, status.HTTP_200_OK, missing_mapping.data)
        self.assertFalse(missing_mapping.data["can_post"])
        ChartOfAccount.objects.filter(system_code="ACCOUNTS_PAYABLE").update(is_active=True)

        DocumentSequence.objects.filter(document_type=DocumentType.JOURNAL_ENTRY).update(is_active=False)
        missing_numbering = self.client.post(f"/api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/", {"idempotency_key": preview["idempotency_key"], "confirm": True}, format="json")
        self.assertEqual(missing_numbering.status_code, status.HTTP_400_BAD_REQUEST)

    def test_batch_post_and_reconciliation_run_diagnostics(self):
        payment = self._payment(payment_no="F7-VP-RUN")
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F7_TEST", module="ACCOUNTING_BRIDGE", date_from=payment.payment_date, date_to=payment.payment_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=run, source_type="VendorPayment", source_id=str(payment.id), exception_code="VENDOR_PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING").exists())

        candidate_id = self._candidate_id(payment)
        batch_preview = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-preview/", {"candidate_ids": [candidate_id]}, format="json")
        self.assertEqual(batch_preview.status_code, status.HTTP_200_OK, batch_preview.data)
        key = batch_preview.data["previews"][0]["idempotency_key"]
        batch_post = self.client.post("/api/v1/admin/accounting/bridge-reconciliation/batch-post/", {"candidate_ids": [candidate_id], "idempotency_keys": {candidate_id: key}, "confirm": True}, format="json")
        self.assertEqual(batch_post.status_code, status.HTTP_200_OK, batch_post.data)

        clean_run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F7_CLEAN", module="ACCOUNTING_BRIDGE", date_from=payment.payment_date, date_to=payment.payment_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=clean_run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=clean_run, source_type="VendorPayment", source_id=str(payment.id), exception_code="POSTED_UNVERIFIED").exists())

        journal = JournalEntry.objects.get(pk=batch_post.data["posted"][0]["journal_entry"]["id"])
        JournalEntry.objects.create(entry_date=journal.entry_date, entry_type=journal.entry_type, memo="duplicate", source_model="VendorPayment", source_id=str(payment.id), voucher_type=journal.voucher_type, status=journal.status, posted_at=timezone.now(), posted_by=self.admin, financial_year=journal.financial_year, accounting_period=journal.accounting_period)
        duplicate_run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F7_DUP", module="ACCOUNTING_BRIDGE", date_from=payment.payment_date, date_to=payment.payment_date, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        run_accounting_bridge_checks(run=duplicate_run, totals={"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0})
        self.assertTrue(ReconciliationItem.objects.filter(run=duplicate_run, source_type="VendorPayment", source_id=str(payment.id), exception_code="DUPLICATE_JOURNAL_SOURCE_REFERENCE").exists())
