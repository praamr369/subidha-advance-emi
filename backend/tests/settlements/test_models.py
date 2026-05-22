from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounting.models import FinanceAccountKind, MoneyMovement
from reconciliation.models import ReconciliationItem, ReconciliationRun
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    CashierDayClose,
    SettlementAllocation,
    SettlementAllocationSourceType,
    UpiSettlementImport,
    UpiSettlementLine,
)
from subscriptions.models import Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_emi,
    create_finance_account,
    create_lucky_id,
    create_product,
    create_subscription,
)


class SettlementPhaseL0ModelTests(TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.admin = create_admin_user(username="settle_admin", phone="9364200001")
        self.cashier = create_cashier_user(username="settle_cashier", phone="9364200002")
        self.bank_account = create_finance_account(
            code="SETTLE-BANK-001",
            name="Settlement Bank",
            kind=FinanceAccountKind.BANK,
        )
        self.upi_account = create_finance_account(
            code="SETTLE-UPI-001",
            name="Settlement UPI",
            kind=FinanceAccountKind.UPI,
        )
        self.cash_account = create_finance_account(
            code="SETTLE-CASH-001",
            name="Settlement Cash",
            kind=FinanceAccountKind.CASH,
        )

    def test_creating_imports_and_lines_creates_no_reconciliation_items(self):
        self.assertEqual(ReconciliationRun.objects.count(), 0)
        self.assertEqual(ReconciliationItem.objects.count(), 0)

        bank_import = BankStatementImport.objects.create(
            import_no="BSI-TEST-0001",
            bank_finance_account=self.bank_account,
            statement_period_from=self.today,
            statement_period_to=self.today,
            uploaded_by=self.admin,
            status="UPLOADED",
            checksum="ABCDEF",
            metadata={"source": "unit-test"},
        )
        BankStatementLine.objects.create(
            statement_import=bank_import,
            transaction_date=self.today,
            description="Test bank line",
            debit=Decimal("100.00"),
            credit=Decimal("0.00"),
            raw_payload={"row": 1},
        )

        upi_import = UpiSettlementImport.objects.create(
            import_no="UPI-TEST-0001",
            upi_finance_account=self.upi_account,
            settlement_date=self.today,
            uploaded_by=self.admin,
            status="UPLOADED",
            checksum="1234",
            metadata={"gateway": "unit-test"},
        )
        UpiSettlementLine.objects.create(
            settlement_import=upi_import,
            transaction_ref="TXN-001",
            payment_ref="PAY-001",
            gross_amount=Decimal("100.00"),
            fee_amount=Decimal("2.00"),
            net_amount=Decimal("98.00"),
            settlement_date=self.today,
            raw_payload={"row": 1},
        )

        CashierDayClose.objects.create(
            close_no="CDC-TEST-0001",
            cashier=self.cashier,
            business_date=self.today,
            finance_account=self.cash_account,
            opening_cash=Decimal("0.00"),
            system_cash_total=Decimal("100.00"),
            counted_cash=Decimal("95.00"),
            variance=Decimal("-5.00"),
            status="DRAFT",
            notes="Unit test close",
            metadata={"source": "unit-test"},
        )

        self.assertEqual(ReconciliationRun.objects.count(), 0)
        self.assertEqual(ReconciliationItem.objects.count(), 0)

    def test_import_no_and_close_no_are_unique(self):
        BankStatementImport.objects.create(
            import_no="BSI-TEST-UNIQ",
            bank_finance_account=self.bank_account,
            statement_period_from=self.today,
            statement_period_to=self.today,
        )
        with self.assertRaises(ValidationError):
            BankStatementImport.objects.create(
                import_no="BSI-TEST-UNIQ",
                bank_finance_account=self.bank_account,
                statement_period_from=self.today,
                statement_period_to=self.today,
            )

        CashierDayClose.objects.create(
            close_no="CDC-TEST-UNIQ",
            cashier=self.cashier,
            business_date=self.today,
        )
        with self.assertRaises(ValidationError):
            CashierDayClose.objects.create(
                close_no="CDC-TEST-UNIQ",
                cashier=self.cashier,
                business_date=self.today,
            )

    def test_bank_statement_line_disallows_dual_debit_credit(self):
        bank_import = BankStatementImport.objects.create(
            import_no="BSI-TEST-DC-0001",
            bank_finance_account=self.bank_account,
            statement_period_from=self.today,
            statement_period_to=self.today,
        )
        with self.assertRaises(ValidationError):
            BankStatementLine.objects.create(
                statement_import=bank_import,
                transaction_date=self.today,
                description="Invalid dual sign",
                debit=Decimal("10.00"),
                credit=Decimal("5.00"),
            )

    def test_raw_payload_is_preserved(self):
        bank_import = BankStatementImport.objects.create(
            import_no="BSI-TEST-RAW-0001",
            bank_finance_account=self.bank_account,
            statement_period_from=self.today,
            statement_period_to=self.today,
        )
        payload = {"col_a": "x", "col_b": 123, "nested": {"ok": True}}
        line = BankStatementLine.objects.create(
            statement_import=bank_import,
            transaction_date=self.today,
            description="Payload check",
            debit=Decimal("1.00"),
            raw_payload=payload,
        )
        line.refresh_from_db()
        self.assertEqual(line.raw_payload, payload)

    def test_cashier_day_close_variance_is_stored_as_provided(self):
        close = CashierDayClose.objects.create(
            close_no="CDC-TEST-VAR-0001",
            cashier=self.cashier,
            business_date=date(2026, 5, 1),
            system_cash_total=Decimal("100.00"),
            counted_cash=Decimal("90.00"),
            variance=Decimal("-10.00"),
        )
        close.refresh_from_db()
        self.assertEqual(close.variance, Decimal("-10.00"))

    def test_settlement_allocation_can_link_payment_receipt_money_movement_without_mutation(self):
        customer = create_customer_profile(name="Settlement Customer", phone="7364200001")
        product = create_product(name="Settlement Product", product_code="SETTLE-01", base_price=Decimal("1000.00"))
        batch = create_batch(batch_code="SETTLE2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 4, 1))
        lucky_id = create_lucky_id(batch=batch, lucky_number=7)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=1,
            start_date=date(2026, 4, 1),
        )
        emi = create_emi(subscription=subscription, month_no=1, amount=Decimal("1000.00"), due_date=date(2026, 4, 5))
        payment = Payment.objects.create(
            customer=customer,
            subscription=subscription,
            emi=emi,
            amount=Decimal("1000.00"),
            method="CASH",
            reference_no="SETTLE-PAY-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
            finance_account=self.cash_account,
        )

        from_account = self.cash_account
        to_account = self.bank_account
        movement = MoneyMovement.objects.create(
            movement_date=date(2026, 5, 2),
            from_finance_account=from_account,
            to_finance_account=to_account,
            amount=Decimal("1000.00"),
            reference_no="SETTLE-MOV-001",
            status="DRAFT",
        )

        # ReceiptDocument import is intentionally local to the test to avoid adding any Phase L0 import APIs.
        from billing.models import ReceiptDocument

        receipt = ReceiptDocument.objects.create(
            receipt_no="RCT-SETTLE-001",
            receipt_type="EMI_PAYMENT_RECEIPT",
            status="DRAFT",
            receipt_date=date(2026, 5, 2),
            amount=Decimal("1000.00"),
            payment=payment,
            finance_account=self.cash_account,
        )

        payment_snapshot = {
            "amount": payment.amount,
            "reference_no": payment.reference_no,
            "method": payment.method,
            "finance_account_id": payment.finance_account_id,
        }
        movement_snapshot = {
            "amount": movement.amount,
            "status": movement.status,
            "from_finance_account_id": movement.from_finance_account_id,
            "to_finance_account_id": movement.to_finance_account_id,
        }
        receipt_snapshot = {
            "amount": receipt.amount,
            "status": receipt.status,
            "payment_id": receipt.payment_id,
        }

        allocation = SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.CASHIER_DAY_CLOSE,
            source_id="1",
            finance_account=self.cash_account,
            matched_amount=Decimal("1000.00"),
            status="PROPOSED",
            payment=payment,
            receipt=receipt,
            money_movement=movement,
            matched_by=self.admin,
            matched_at=timezone.now(),
            metadata={"note": "unit-test"},
        )
        self.assertIsNotNone(allocation.id)

        payment.refresh_from_db()
        movement.refresh_from_db()
        receipt.refresh_from_db()

        self.assertEqual(payment.amount, payment_snapshot["amount"])
        self.assertEqual(payment.reference_no, payment_snapshot["reference_no"])
        self.assertEqual(payment.method, payment_snapshot["method"])
        self.assertEqual(payment.finance_account_id, payment_snapshot["finance_account_id"])

        self.assertEqual(movement.amount, movement_snapshot["amount"])
        self.assertEqual(movement.status, movement_snapshot["status"])
        self.assertEqual(movement.from_finance_account_id, movement_snapshot["from_finance_account_id"])
        self.assertEqual(movement.to_finance_account_id, movement_snapshot["to_finance_account_id"])

        self.assertEqual(receipt.amount, receipt_snapshot["amount"])
        self.assertEqual(receipt.status, receipt_snapshot["status"])
        self.assertEqual(receipt.payment_id, receipt_snapshot["payment_id"])
