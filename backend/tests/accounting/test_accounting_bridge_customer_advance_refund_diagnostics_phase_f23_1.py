from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounting.models import AccountingBridgePosting, ChartOfAccount, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from billing.models import BillingDocumentStatus, BillingSourceType, ReceiptDocument, ReceiptType
from reconciliation.models import ReconciliationItem, ReconciliationRun, ReconciliationRunStatus
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from subscriptions.models import CustomerAdvanceAllocation, Payment
from subscriptions.services.customer_advance_refund_source_contract_service import record_customer_advance_refund
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class CustomerAdvanceRefundDiagnosticsPhaseF231Tests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f231_admin", phone="9305310001")
        self.customer = create_customer_profile(name="F23.1 Customer", phone="7305310001")
        self.product = create_product(name="F23.1 Product", product_code="F231-PROD", base_price=Decimal("3000.00"))
        self.batch = create_batch(batch_code="F231BATCH", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=31)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("3000.00"), monthly_amount=Decimal("1000.00"), tenure_months=3)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 6, 23))
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]

    def _advance(self, *, amount=Decimal("900.00"), suffix="001"):
        return CustomerAdvanceService.collect_unapplied_advance(customer_id=self.customer.id, amount=amount, collected_by=self.admin, finance_account_id=self.finance_account.id, method="CASH", reference_no=f"F231-ADV-{suffix}", payment_date=self.today, idempotency_key=f"f231-advance-{suffix}")

    def _refund(self, *, amount=Decimal("300.00"), suffix="001"):
        advance = self._advance(amount=Decimal("900.00"), suffix=suffix)
        return record_customer_advance_refund(customer_advance_id=advance.id, amount=amount, refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="BANK", refund_date=self.today, refund_reference_no=f"F231-REF-{suffix}", idempotency_key=f"f231-refund-{suffix}")

    def _run_checks(self):
        run = ReconciliationRun.objects.create(run_no=next_reconciliation_run_no(), scope="PHASE_F231_TEST", module="ACCOUNTING_BRIDGE", date_from=self.today, date_to=self.today, status=ReconciliationRunStatus.RUNNING, started_by=self.admin)
        totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
        run_accounting_bridge_checks(run=run, totals=totals)
        return run

    def _post_refund(self, refund):
        from accounting.services.accounting_bridge_customer_advance_refund_service import post_bridge_candidate, preview_bridge_candidate

        candidate_id = f"customeradvancerefund:{refund.id}:customer_advance_refund"
        preview = preview_bridge_candidate(candidate_id)
        return post_bridge_candidate(candidate_id=candidate_id, idempotency_key=preview["idempotency_key"], confirmed=True, actor=self.admin)

    def _snapshot(self, refund):
        refund.refresh_from_db()
        refund.advance.refresh_from_db()
        refund.finance_account.refresh_from_db()
        return {
            "refund": {
                "advance_id": refund.advance_id,
                "customer_id": refund.customer_id,
                "finance_account_id": refund.finance_account_id,
                "amount": refund.amount,
                "refund_date": refund.refund_date,
                "payment_method": refund.payment_method,
                "status": refund.status,
                "refund_reference_no": refund.refund_reference_no,
                "metadata_snapshot": refund.metadata_snapshot,
            },
            "advance": {
                "amount": refund.advance.amount,
                "unapplied_amount": refund.advance.unapplied_amount,
                "status": refund.advance.status,
            },
            "finance_account": {
                "is_active": refund.finance_account.is_active,
                "chart_account_id": refund.finance_account.chart_account_id,
            },
        }

    def assertDiagnostic(self, run, refund, code):
        self.assertTrue(
            ReconciliationItem.objects.filter(run=run, source_type="CustomerAdvanceRefund", source_id=str(refund.id), exception_code=code).exists(),
            f"Expected {code} for CustomerAdvanceRefund {refund.id}",
        )

    def test_run_reports_missing_bridge_posting_and_does_not_mutate_sources(self):
        refund = self._refund(suffix="MISSING")
        receipt = ReceiptDocument.objects.create(receipt_no="F231-RCT", receipt_type=ReceiptType.RETAIL_RECEIPT, status=BillingDocumentStatus.APPROVED, receipt_date=self.today, finance_account=self.finance_account, customer=self.customer, source_type=BillingSourceType.MANUAL, amount=Decimal("100.00"))
        allocation = PaymentAllocationService.allocate_customer_advance(customer_advance_id=refund.advance.id, emi_id=self.emi.id, amount=Decimal("100.00"), allocated_by=self.admin, reference_no="F231-ALLOC", allocation_date=self.today)["allocation"]
        payment = allocation.payment
        before = {
            "refund": self._snapshot(refund),
            "allocation": CustomerAdvanceAllocation.objects.filter(pk=allocation.pk).values("amount", "advance_id", "payment_id", "emi_id", "subscription_id").get(),
            "payment": Payment.objects.filter(pk=payment.pk).values("amount", "reference_no", "method", "payment_date").get(),
            "receipt": ReceiptDocument.objects.filter(pk=receipt.pk).values("amount", "receipt_no", "status", "source_type").get(),
        }
        run = self._run_checks()
        self.assertDiagnostic(run, refund, "CUSTOMER_ADVANCE_REFUND_MISSING_ACCOUNTING_BRIDGE_POSTING")
        after = {
            "refund": self._snapshot(refund),
            "allocation": CustomerAdvanceAllocation.objects.filter(pk=allocation.pk).values("amount", "advance_id", "payment_id", "emi_id", "subscription_id").get(),
            "payment": Payment.objects.filter(pk=payment.pk).values("amount", "reference_no", "method", "payment_date").get(),
            "receipt": ReceiptDocument.objects.filter(pk=receipt.pk).values("amount", "receipt_no", "status", "source_type").get(),
        }
        self.assertEqual(after, before)

    def test_run_reports_posted_unverified_amount_source_link_unbalanced_and_duplicate(self):
        posted = self._refund(suffix="POSTED")
        self._post_refund(posted)
        posted_run = self._run_checks()
        self.assertDiagnostic(posted_run, posted, "CUSTOMER_ADVANCE_REFUND_POSTED_UNVERIFIED")

        mismatch = self._refund(suffix="AMOUNT")
        self._post_refund(mismatch)
        mismatch_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(mismatch.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        for line in mismatch_journal.lines.all():
            line.__class__.objects.filter(pk=line.pk).update(debit_amount=Decimal("200.00") if line.debit_amount else Decimal("0.00"), credit_amount=Decimal("200.00") if line.credit_amount else Decimal("0.00"))
        amount_run = self._run_checks()
        self.assertDiagnostic(amount_run, mismatch, "CUSTOMER_ADVANCE_REFUND_AMOUNT_MISMATCH")

        broken = self._refund(suffix="LINK")
        self._post_refund(broken)
        broken_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(broken.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        JournalEntry.objects.filter(pk=broken_journal.pk).update(source_id="wrong-source-id")
        link_run = self._run_checks()
        self.assertTrue(ReconciliationItem.objects.filter(run=link_run, exception_code="CUSTOMER_ADVANCE_REFUND_SOURCE_LINK_MISSING").exists())

        unbalanced = self._refund(suffix="UNBAL")
        self._post_refund(unbalanced)
        unbalanced_journal = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(unbalanced.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        credit_line = unbalanced_journal.lines.filter(credit_amount__gt=0).first()
        credit_line.__class__.objects.filter(pk=credit_line.pk).update(credit_amount=Decimal("299.00"))
        unbalanced_run = self._run_checks()
        self.assertDiagnostic(unbalanced_run, unbalanced, "CUSTOMER_ADVANCE_REFUND_JOURNAL_UNBALANCED")

        duplicate = self._refund(suffix="DUP")
        self._post_refund(duplicate)
        original = AccountingBridgePosting.objects.get(source_model="CustomerAdvanceRefund", source_id=str(duplicate.id), purpose="CUSTOMER_ADVANCE_REFUND").journal_entry
        JournalEntry.objects.create(entry_date=original.entry_date, entry_type=JournalEntryType.SYSTEM_BRIDGE, status=JournalEntryStatus.POSTED, memo="duplicate F23.1 test", source_model="CustomerAdvanceRefund", source_id=str(duplicate.id), voucher_type=original.voucher_type, source_type=original.source_type, source_reference=original.source_reference, financial_year=original.financial_year, accounting_period=original.accounting_period, posted_by=self.admin, posted_at=timezone.now())
        duplicate_run = self._run_checks()
        self.assertDiagnostic(duplicate_run, duplicate, "CUSTOMER_ADVANCE_REFUND_DUPLICATE_ACCOUNTING_BRIDGE_POSTING")

    def test_run_reports_setup_blockers_unsupported_and_duplicate_source_risk(self):
        mapping = self._refund(suffix="MAPPING")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=False)
        mapping_run = self._run_checks()
        self.assertDiagnostic(mapping_run, mapping, "CUSTOMER_ADVANCE_REFUND_MAPPING_MISSING")
        ChartOfAccount.objects.filter(system_code="CUSTOMER_ADVANCE_UNEARNED_REVENUE").update(is_active=True)

        finance = self._refund(suffix="FINANCE")
        self.finance_account.is_active = False
        self.finance_account.save(update_fields=["is_active"])
        finance_run = self._run_checks()
        self.assertDiagnostic(finance_run, finance, "CUSTOMER_ADVANCE_REFUND_FINANCE_ACCOUNT_INACTIVE")
        self.finance_account.is_active = True
        self.finance_account.save(update_fields=["is_active"])

        numbering = self._refund(suffix="NUMBER")
        DocumentSequence.objects.filter(document_type="JOURNAL_ENTRY").delete()
        numbering_run = self._run_checks()
        self.assertDiagnostic(numbering_run, numbering, "CUSTOMER_ADVANCE_REFUND_NUMBERING_MISSING")
        seed_bridge_ready_environment(self.today, performed_by=self.admin)

        unsupported = self._refund(suffix="UNSUPPORTED")
        unsupported.metadata_snapshot = {**(unsupported.metadata_snapshot or {}), "future_bridge_phase": "DIRECT_SALE_REFUND"}
        unsupported.save(update_fields=["metadata_snapshot"])
        unsupported_run = self._run_checks()
        self.assertDiagnostic(unsupported_run, unsupported, "CUSTOMER_ADVANCE_REFUND_UNSUPPORTED_SOURCE")

        duplicate_risk = self._refund(suffix="RISK")
        duplicate_risk.metadata_snapshot = {**(duplicate_risk.metadata_snapshot or {}), "source_model": "DirectSaleReturn"}
        duplicate_risk.save(update_fields=["metadata_snapshot"])
        risk_run = self._run_checks()
        self.assertDiagnostic(risk_run, duplicate_risk, "CUSTOMER_ADVANCE_REFUND_DUPLICATE_SOURCE_RISK")
