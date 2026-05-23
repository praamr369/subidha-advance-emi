from __future__ import annotations

from datetime import date
from decimal import Decimal

from accounting.models import JournalEntry, JournalEntryType
from billing.models import BillingDocumentStatus, ReceiptDocument, ReceiptType
from reconciliation.models import FinancialSourceLifecycleEvent, ReconciliationItem
from reconciliation.services.financial_source_lifecycle_event_service import (
    create_lifecycle_event,
    get_invalidating_events,
    get_latest_lifecycle_event,
    is_payment_valid_for_cash_evidence,
    is_receipt_valid_for_settlement,
)
from settlements.models import SettlementAllocation
from subscriptions.models import OperationalCancellation, Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
)
from django.test import TestCase


class FinancialSourceLifecycleEventServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_fle_test", phone="9030000005")
        self.customer = create_customer_profile(name="FLE Customer", phone="9030000105")
        self.product = create_product(name="FLE Product", product_code="FLE-P-001", base_price=Decimal("1000.00"))
        self.batch = create_batch(batch_code="FLEBATCH2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 5, 1))
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
            start_date=date(2026, 5, 1),
        )
        self.emi = create_emi(subscription=self.subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 5, 5))
        self.payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="FLE-PAY-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
        )
        self.journal = JournalEntry.objects.create(
            entry_date=date(2026, 5, 2),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
        )
        self.receipt = ReceiptDocument.objects.create(
            receipt_no="FLE-RCT-001",
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.POSTED,
            receipt_date=date(2026, 5, 2),
            customer=self.customer,
            subscription=self.subscription,
            payment=self.payment,
            amount=Decimal("1000.00"),
            posted_journal_entry=self.journal,
        )

    def test_create_lifecycle_event_assigns_unique_event_no(self):
        first = create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.POSTED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Payment evidence created",
            amount=Decimal("1000.00"),
            created_by=self.admin,
            related_payment=self.payment,
        )
        second = create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.REVERSED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Payment reversal evidence",
            amount=Decimal("1000.00"),
            created_by=self.admin,
            related_payment=self.payment,
        )

        self.assertNotEqual(first.event_no, second.event_no)
        self.assertTrue(first.event_no.startswith("FLE-"))
        self.assertEqual(FinancialSourceLifecycleEvent.objects.count(), 2)

    def test_get_latest_lifecycle_event_returns_most_recent(self):
        older = create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.POSTED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            amount=Decimal("1000.00"),
            related_payment=self.payment,
        )
        newer = create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.VOIDED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            amount=Decimal("1000.00"),
            related_payment=self.payment,
        )

        latest = get_latest_lifecycle_event(FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT, self.payment.id)
        self.assertEqual(latest.id, newer.id)
        self.assertEqual(latest.event_type, FinancialSourceLifecycleEvent.EventType.VOIDED)

    def test_get_invalidating_events_identifies_active_reversal_events(self):
        create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.POSTED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            amount=Decimal("1000.00"),
        )
        invalidating = create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.REVERSED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Reversal evidence",
            amount=Decimal("1000.00"),
        )

        events = get_invalidating_events(FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT, self.payment.id)
        self.assertEqual(list(events), [invalidating])

    def test_payment_validity_respects_operational_cancellation(self):
        OperationalCancellation.objects.create(
            source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            cancellation_type=OperationalCancellation.CancellationType.PAYMENT_REVERSAL,
            cancelled_by=self.admin,
            reason="Reversed payment",
        )

        self.assertFalse(is_payment_valid_for_cash_evidence(self.payment))

    def test_payment_validity_respects_lifecycle_invalidation_event(self):
        create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
            source_id=self.payment.id,
            event_type=FinancialSourceLifecycleEvent.EventType.CANCELLED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Payment cancellation event",
            amount=Decimal("1000.00"),
            related_payment=self.payment,
        )

        self.assertFalse(is_payment_valid_for_cash_evidence(self.payment))

    def test_receipt_validity_respects_lifecycle_invalidation_event(self):
        create_lifecycle_event(
            source_type=FinancialSourceLifecycleEvent.SourceType.BILLING_RECEIPT,
            source_id=self.receipt.id,
            event_type=FinancialSourceLifecycleEvent.EventType.VOIDED,
            event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
            reason="Receipt voided",
            amount=self.receipt.amount,
            related_receipt=self.receipt,
        )

        self.assertFalse(is_receipt_valid_for_settlement(self.receipt))

    def test_helpers_do_not_mutate_payment_or_receipt_document(self):
        payment_amount_before = self.payment.amount
        receipt_status_before = self.receipt.status
        receipt_amount_before = self.receipt.amount
        _ = is_payment_valid_for_cash_evidence(self.payment)
        _ = is_receipt_valid_for_settlement(self.receipt)
        self.payment.refresh_from_db()
        self.receipt.refresh_from_db()
        self.assertEqual(self.payment.amount, payment_amount_before)
        self.assertEqual(self.receipt.status, receipt_status_before)
        self.assertEqual(self.receipt.amount, receipt_amount_before)

    def test_helpers_do_not_create_reconciliation_or_settlement_allocation_records(self):
        reconciliation_count_before = ReconciliationItem.objects.count()
        allocation_count_before = SettlementAllocation.objects.count()

        _ = is_payment_valid_for_cash_evidence(self.payment)
        _ = is_receipt_valid_for_settlement(self.receipt)

        self.assertEqual(ReconciliationItem.objects.count(), reconciliation_count_before)
        self.assertEqual(SettlementAllocation.objects.count(), allocation_count_before)
