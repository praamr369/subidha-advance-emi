from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    AccountingBridgePosting,
    JournalEntry,
    JournalEntryGroup,
    JournalEntryLine,
    JournalEntryStatus,
    JournalEntryType,
    MoneyMovement,
)
from billing.models import BillingDocumentStatus, ReceiptDocument, ReceiptType
from branch_control.models import Branch
from reconciliation.models import ReconciliationItem
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_emi,
    create_lucky_id,
    create_product,
    create_subscription,
    ensure_default_payment_collection_accounts,
)
from subscriptions.models import Payment


class AdminReconciliationControlTowerSettlementPhaseTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_settlement_phase", phone="9020000001")
        self.customer_user = create_customer_user(username="customer_settlement_phase", phone="9020000002")

        self.branch = Branch.objects.order_by("id").first()
        self.accounts = ensure_default_payment_collection_accounts()

        self.customer = create_customer_profile(user=self.customer_user, name="Settlement Customer", phone="9020000100")
        self.product = create_product(name="Settlement Product", product_code="STL-001", base_price=Decimal("1000.00"))
        self.batch = create_batch(
            batch_code="STLMAR2026",
            duration_months=1,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=1)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 8),
        )

    def _run(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={
                "date_from": "2026-03-01",
                "date_to": "2026-03-31",
                "branch_id": None,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        return resp.data["id"]

    def _exception_codes(self, *, run_id: int) -> set[str]:
        self.client.force_authenticate(user=self.admin)
        items_resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}")
        self.assertEqual(items_resp.status_code, status.HTTP_200_OK)
        return {row["exception_code"] for row in items_resp.data.get("results", [])}

    def test_payment_missing_bridge_creates_item(self):
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="STL-PAY-NOBRIDGE",
            payment_date=date(2026, 3, 9),
            branch=self.branch,
            finance_account=self.accounts["CASH"],
        )

        run_id = self._run()
        self.assertIn("PAYMENT_SETTLEMENT_BRIDGE_MISSING", self._exception_codes(run_id=run_id))

        payment.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("1000.00"))

    def test_payment_journal_source_mismatch_creates_item(self):
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="BANK",
            reference_no="STL-PAY-BRIDGE-BADSRC",
            payment_date=date(2026, 3, 10),
            branch=self.branch,
            finance_account=self.accounts["BANK"],
        )
        bad_journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 10),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Bad payment source link",
            source_model="Payment",
            source_id="999999",
            voucher_type="PAYMENT_COLLECTION",
        )
        AccountingBridgePosting.objects.create(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_COLLECTION",
            voucher_type="PAYMENT_COLLECTION",
            source_type="SUBSCRIPTION_PAYMENT",
            source_reference=payment.reference_no,
            source_document_no=payment.reference_no,
            source_event_date=payment.payment_date,
            trace_metadata={"payment_id": payment.id},
            journal_entry=bad_journal,
        )

        run_id = self._run()
        self.assertIn(
            "PAYMENT_SETTLEMENT_JOURNAL_SOURCE_LINK_INVALID",
            self._exception_codes(run_id=run_id),
        )

    def test_duplicate_payment_journal_source_creates_item(self):
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="STL-PAY-DUPE",
            payment_date=date(2026, 3, 11),
            branch=self.branch,
            finance_account=self.accounts["CASH"],
        )
        JournalEntry.objects.create(
            entry_date=date(2026, 3, 11),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Dupe 1",
            source_model="Payment",
            source_id=str(payment.id),
            voucher_type="PAYMENT_COLLECTION",
        )
        JournalEntry.objects.create(
            entry_date=date(2026, 3, 11),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Dupe 2",
            source_model="Payment",
            source_id=str(payment.id),
            voucher_type="PAYMENT_COLLECTION",
        )

        run_id = self._run()
        self.assertIn(
            "PAYMENT_SETTLEMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            self._exception_codes(run_id=run_id),
        )

    def test_payment_journal_amount_mismatch_creates_item_when_deterministic(self):
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="STL-PAY-AMT-MISMATCH",
            payment_date=date(2026, 3, 12),
            branch=self.branch,
            finance_account=self.accounts["CASH"],
        )
        journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 12),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Payment amount mismatch",
            source_model="Payment",
            source_id=str(payment.id),
            voucher_type="PAYMENT_COLLECTION",
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["CASH"].chart_account,
            description="Debit cash",
            debit_amount=Decimal("900.00"),
            credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["BANK"].chart_account,
            description="Credit AR (stub)",
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("900.00"),
        )
        AccountingBridgePosting.objects.create(
            source_model="Payment",
            source_id=str(payment.id),
            purpose="PAYMENT_COLLECTION",
            voucher_type="PAYMENT_COLLECTION",
            source_type="SUBSCRIPTION_PAYMENT",
            source_reference=payment.reference_no,
            source_document_no=payment.reference_no,
            source_event_date=payment.payment_date,
            trace_metadata={"payment_id": payment.id},
            journal_entry=journal,
        )

        run_id = self._run()
        self.assertIn(
            "PAYMENT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
            self._exception_codes(run_id=run_id),
        )

    def test_receipt_document_amount_mismatch_creates_item_when_deterministic(self):
        journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 13),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Receipt amount mismatch",
            source_model="ReceiptDocument",
            source_id="9999",
            voucher_type="EMI_PAYMENT_RECEIPT",
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["CASH"].chart_account,
            description="Debit cash",
            debit_amount=Decimal("800.00"),
            credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["BANK"].chart_account,
            description="Credit AR (stub)",
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("800.00"),
        )
        receipt = ReceiptDocument.objects.create(
            receipt_no="STL-RCT-001",
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.POSTED,
            receipt_date=date(2026, 3, 13),
            branch=self.branch,
            customer=self.customer,
            subscription=self.subscription,
            payment=None,
            amount=Decimal("1000.00"),
            finance_account=self.accounts["CASH"],
            posted_journal_entry=journal,
        )

        run_id = self._run()
        self.assertIn(
            "RECEIPT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
            self._exception_codes(run_id=run_id),
        )

        receipt.refresh_from_db()
        self.assertEqual(receipt.amount, Decimal("1000.00"))

    def test_money_movement_posted_journal_missing_creates_item(self):
        movement = MoneyMovement.objects.create(
            movement_date=date(2026, 3, 14),
            from_finance_account=self.accounts["CASH"],
            to_finance_account=self.accounts["BANK"],
            amount=Decimal("500.00"),
            status="DRAFT",
        )
        MoneyMovement.objects.filter(pk=movement.pk).update(status="POSTED", posted_journal_entry_id=None)

        run_id = self._run()
        self.assertIn("MONEY_MOVEMENT_POSTED_JOURNAL_MISSING", self._exception_codes(run_id=run_id))

    def test_money_movement_source_mismatch_creates_item(self):
        bad_journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 15),
            entry_type=JournalEntryType.MONEY_MOVEMENT,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Bad movement source link",
            source_model="MoneyMovement",
            source_id="999999",
            voucher_type="MONEY_MOVEMENT",
        )
        movement = MoneyMovement.objects.create(
            movement_date=date(2026, 3, 15),
            from_finance_account=self.accounts["CASH"],
            to_finance_account=self.accounts["BANK"],
            amount=Decimal("500.00"),
            status="DRAFT",
            posted_journal_entry=bad_journal,
        )
        MoneyMovement.objects.filter(pk=movement.pk).update(status="POSTED")

        run_id = self._run()
        self.assertIn("MONEY_MOVEMENT_JOURNAL_SOURCE_LINK_INVALID", self._exception_codes(run_id=run_id))

    def test_money_movement_amount_mismatch_creates_item_when_deterministic(self):
        movement = MoneyMovement.objects.create(
            movement_date=date(2026, 3, 16),
            from_finance_account=self.accounts["CASH"],
            to_finance_account=self.accounts["BANK"],
            amount=Decimal("500.00"),
            status="DRAFT",
        )
        journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 16),
            entry_type=JournalEntryType.MONEY_MOVEMENT,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Movement amount mismatch",
            source_model="MoneyMovement",
            source_id=str(movement.id),
            voucher_type="MONEY_MOVEMENT",
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["CASH"].chart_account,
            description="Debit bank",
            debit_amount=Decimal("450.00"),
            credit_amount=Decimal("0.00"),
        )
        JournalEntryLine.objects.create(
            journal_entry=journal,
            chart_account=self.accounts["BANK"].chart_account,
            description="Credit cash",
            debit_amount=Decimal("0.00"),
            credit_amount=Decimal("450.00"),
        )
        MoneyMovement.objects.filter(pk=movement.pk).update(status="POSTED", posted_journal_entry_id=journal.id)

        run_id = self._run()
        self.assertIn("MONEY_MOVEMENT_JOURNAL_AMOUNT_MISMATCH", self._exception_codes(run_id=run_id))

    def test_money_movement_unbalanced_group_creates_item_when_group_exists(self):
        group = JournalEntryGroup.objects.create(
            source_module="tests.reconciliation.settlement",
            source_object_id="MM-GRP-1",
            transaction_date=date(2026, 3, 17),
            narration="Unbalanced group",
            total_debit=Decimal("100.00"),
            total_credit=Decimal("90.00"),
            created_by=self.admin,
        )
        movement = MoneyMovement.objects.create(
            movement_date=date(2026, 3, 17),
            from_finance_account=self.accounts["CASH"],
            to_finance_account=self.accounts["BANK"],
            amount=Decimal("100.00"),
            status="DRAFT",
        )
        journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 17),
            entry_type=JournalEntryType.MONEY_MOVEMENT,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Movement with unbalanced group",
            source_model="MoneyMovement",
            source_id=str(movement.id),
            voucher_type="MONEY_MOVEMENT",
            journal_group=group,
        )
        MoneyMovement.objects.filter(pk=movement.pk).update(status="POSTED", posted_journal_entry_id=journal.id)

        run_id = self._run()
        self.assertIn("MONEY_MOVEMENT_JOURNAL_GROUP_UNBALANCED", self._exception_codes(run_id=run_id))

    def test_sources_not_mutated_by_settlement_reconciliation(self):
        payment = Payment.objects.create(
            customer=self.customer,
            subscription=self.subscription,
            emi=self.emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="STL-PAY-NOMUTATE",
            payment_date=date(2026, 3, 18),
            branch=self.branch,
            finance_account=self.accounts["CASH"],
        )
        receipt_journal = JournalEntry.objects.create(
            entry_date=date(2026, 3, 18),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Receipt journal",
            source_model="ReceiptDocument",
            source_id="1",
            voucher_type="EMI_PAYMENT_RECEIPT",
        )
        receipt = ReceiptDocument.objects.create(
            receipt_no="STL-RCT-NOMUTATE",
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.POSTED,
            receipt_date=date(2026, 3, 18),
            branch=self.branch,
            customer=self.customer,
            subscription=self.subscription,
            payment=None,
            amount=Decimal("1000.00"),
            finance_account=self.accounts["CASH"],
            posted_journal_entry=receipt_journal,
        )

        run_id = self._run()
        self.assertTrue(ReconciliationItem.objects.filter(run_id=run_id).exists())

        payment.refresh_from_db()
        receipt.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("1000.00"))
        self.assertEqual(receipt.amount, Decimal("1000.00"))
