from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounting.models import AccountingBridgePosting, JournalEntry, ReconciliationItem
from billing.models import DirectSaleReturn
from subscriptions.models import CustomerAdvance, CustomerAdvanceAllocation, Payment
from subscriptions.models_customer_advance_refund import CustomerAdvanceRefund, CustomerAdvanceRefundStatus
from subscriptions.services.customer_advance_refund_source_contract_service import (
    EVENT_KEY,
    SOURCE_MODEL,
    classify_customer_advance_refund_source,
    customer_advance_refund_source_matrix,
    list_customer_advance_refund_sources,
    record_customer_advance_refund,
)
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_allocation_service import PaymentAllocationService
from tests.accounting.helpers import seed_bridge_ready_environment
from tests.helpers import create_admin_user, create_batch, create_customer_profile, create_emi, create_lucky_id, create_product, create_subscription


class CustomerAdvanceRefundSourceContractPhaseF22Tests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="phase_f22_admin", phone="9305220001")
        self.customer = create_customer_profile(name="F22 Customer", phone="7305220001")
        self.product = create_product(name="F22 Product", product_code="F22-PROD", base_price=Decimal("3000.00"))
        self.batch = create_batch(batch_code="F22BATCH", duration_months=3, total_slots=100)
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=22)
        self.subscription = create_subscription(customer=self.customer, product=self.product, batch=self.batch, lucky_id=self.lucky_id, total_amount=Decimal("3000.00"), monthly_amount=Decimal("1000.00"), tenure_months=3)
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 6, 22))
        self.today = timezone.localdate()
        self.env = seed_bridge_ready_environment(self.today, performed_by=self.admin)
        self.finance_account = self.env["finance_account"]

    def _advance(self, *, amount=Decimal("900.00"), suffix="001") -> CustomerAdvance:
        return CustomerAdvanceService.collect_unapplied_advance(
            customer_id=self.customer.id,
            amount=amount,
            collected_by=self.admin,
            finance_account_id=self.finance_account.id,
            method="CASH",
            reference_no=f"F22-ADV-{suffix}",
            payment_date=self.today,
            idempotency_key=f"f22-advance-{suffix}",
        )

    def _counts(self):
        return {
            "journals": JournalEntry.objects.count(),
            "bridge_postings": AccountingBridgePosting.objects.count(),
            "reconciliation_items": ReconciliationItem.objects.count(),
        }

    def test_source_matrix_selects_customer_advance_refund_only(self):
        matrix = customer_advance_refund_source_matrix()
        chosen = [row for row in matrix if row["decision"] == "chosen"]
        rejected = {row["source_model"]: row["decision"] for row in matrix if row["decision"] != "chosen"}
        self.assertEqual(chosen[0]["source_model"], SOURCE_MODEL)
        self.assertEqual(chosen[0]["event_type"], EVENT_KEY)
        self.assertEqual(rejected["CustomerAdvance"], "reject")
        self.assertEqual(rejected["CustomerAdvanceAllocation"], "reject")
        self.assertEqual(rejected["RentLeaseDepositTransaction"], "reject")

    def test_refund_source_captures_required_evidence_without_accounting_records(self):
        advance = self._advance(suffix="SRC")
        before_counts = self._counts()
        refund = record_customer_advance_refund(
            customer_advance_id=advance.id,
            amount=Decimal("400.00"),
            refunded_by=self.admin,
            finance_account_id=self.finance_account.id,
            payment_method="BANK",
            refund_date=self.today,
            refund_reference_no="F22-REF-SRC",
            idempotency_key="f22-ref-src",
            notes="Source contract test",
        )
        self.assertEqual(refund.customer_id, self.customer.id)
        self.assertEqual(refund.advance_id, advance.id)
        self.assertEqual(refund.amount, Decimal("400.00"))
        self.assertEqual(refund.payment_method, "BANK")
        self.assertEqual(refund.finance_account_id, self.finance_account.id)
        self.assertEqual(refund.refund_date, self.today)
        self.assertEqual(refund.status, CustomerAdvanceRefundStatus.ACTIVE)
        self.assertEqual(refund.metadata_snapshot["source_contract_phase"], "F22")
        self.assertEqual(refund.metadata_snapshot["future_bridge_phase"], "F23_CUSTOMER_ADVANCE_REFUND")
        self.assertEqual(self._counts(), before_counts)
        advance.refresh_from_db()
        self.assertEqual(advance.unapplied_amount, Decimal("500.00"))
        self.assertEqual(advance.status, "PARTIALLY_APPLIED")

    def test_idempotency_returns_existing_and_does_not_reduce_balance_twice(self):
        advance = self._advance(suffix="IDEMP")
        first = record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("900.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="CASH", refund_date=self.today, refund_reference_no="F22-REF-IDEMP", idempotency_key="f22-ref-idemp")
        second = record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("900.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="CASH", refund_date=self.today, refund_reference_no="F22-REF-IDEMP", idempotency_key="f22-ref-idemp")
        self.assertEqual(first.id, second.id)
        self.assertEqual(CustomerAdvanceRefund.objects.filter(advance=advance).count(), 1)
        advance.refresh_from_db()
        self.assertEqual(advance.unapplied_amount, Decimal("0.00"))
        self.assertEqual(advance.status, "FULLY_APPLIED")

    def test_duplicate_reference_or_key_mismatch_rejected(self):
        advance = self._advance(suffix="DUP")
        record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("300.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="UPI", refund_date=self.today, refund_reference_no="F22-REF-DUP", idempotency_key="f22-ref-dup")
        with self.assertRaisesMessage(ValueError, "different source evidence"):
            record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("200.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="UPI", refund_date=self.today, refund_reference_no="F22-REF-DUP", idempotency_key="f22-ref-dup")

    def test_separation_rules_do_not_classify_receipt_application_payment_or_other_refunds(self):
        advance = self._advance(suffix="SEP")
        allocation = PaymentAllocationService.allocate_customer_advance(customer_advance_id=advance.id, emi_id=self.emi.id, amount=Decimal("100.00"), allocated_by=self.admin, reference_no="F22-ALLOC-SEP", allocation_date=self.today)["allocation"]
        payment = allocation.payment
        self.assertIsInstance(advance, CustomerAdvance)
        self.assertIsInstance(allocation, CustomerAdvanceAllocation)
        self.assertIsInstance(payment, Payment)
        self.assertFalse(classify_customer_advance_refund_source(source_model="CustomerAdvance", event_key="customer_advance_receipt"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="CustomerAdvanceAllocation", event_key="customer_advance_application"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="Payment", event_key="subscription_emi_payment"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="RentLeaseDepositTransaction", event_key="security_deposit_refund"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="DirectSaleReturn", event_key="direct_sale_return"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="BillingCreditNote", event_key="customer_credit_note"))
        self.assertFalse(classify_customer_advance_refund_source(source_model="ReceiptDocument", event_key="customer_advance"))
        refund = record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("100.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="CASH", refund_date=self.today, refund_reference_no="F22-REF-SEP", idempotency_key="f22-ref-sep")
        self.assertTrue(classify_customer_advance_refund_source(source_model="CustomerAdvanceRefund", event_key="customer_advance_refund", source_type="CUSTOMER_ADVANCE_REFUND", metadata=refund.metadata_snapshot))

    def test_refund_source_listing_is_evidence_only(self):
        advance = self._advance(suffix="LIST")
        refund = record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("250.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="CASH", refund_date=self.today, refund_reference_no="F22-REF-LIST", idempotency_key="f22-ref-list")
        rows = list_customer_advance_refund_sources(customer_id=self.customer.id)
        self.assertEqual(rows[0]["id"], refund.id)
        self.assertEqual(rows[0]["source_model"], "CustomerAdvanceRefund")
        self.assertEqual(rows[0]["event_key"], "customer_advance_refund")
        self.assertEqual(rows[0]["operator_note"], "Accounting bridge posting remains controlled and deferred.")
        self.assertEqual(self._counts(), {"journals": 0, "bridge_postings": 0, "reconciliation_items": 0})

    def test_source_contract_does_not_close_period_or_create_accounting_side_effects(self):
        period = self.env["accounting_period"]
        original_period_status = period.status
        advance = self._advance(suffix="NOPOST")
        before_counts = self._counts()
        record_customer_advance_refund(customer_advance_id=advance.id, amount=Decimal("100.00"), refunded_by=self.admin, finance_account_id=self.finance_account.id, payment_method="BANK", refund_date=self.today, refund_reference_no="F22-REF-NOPOST", idempotency_key="f22-ref-nopost")
        period.refresh_from_db()
        self.assertEqual(period.status, original_period_status)
        self.assertEqual(self._counts(), before_counts)
