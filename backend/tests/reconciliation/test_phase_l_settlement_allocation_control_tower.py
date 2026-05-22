from __future__ import annotations

from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from reconciliation.models import ReconciliationItem
from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    CashierDayClose,
    ImportStatus,
    LineMatchedStatus,
    SettlementAllocation,
    SettlementAllocationSourceType,
    SettlementAllocationStatus,
    UpiSettlementImport,
    UpiSettlementLine,
)
from subscriptions.models import Payment
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_finance_account,
    create_lucky_id,
    create_product,
    create_subscription,
)


class AdminReconciliationControlTowerSettlementAllocationChecksTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="admin_settlement_alloc_checks", phone="9030000001")

        self.bank_account = create_finance_account(code="REC-SETTLE-BANK-001", name="Recon Bank", kind="BANK")
        self.bank_account_other = create_finance_account(code="REC-SETTLE-BANK-002", name="Recon Bank Other", kind="BANK")
        self.upi_account = create_finance_account(code="REC-SETTLE-UPI-001", name="Recon UPI", kind="UPI")

        self.customer = create_customer_profile(name="Recon Customer", phone="9030000100")
        self.product = create_product(name="Recon Product", product_code="REC-P-001", base_price=Decimal("1000.00"))
        self.batch = create_batch(batch_code="RECONMAY2026", duration_months=1, total_slots=100, draw_day=5, start_date=date(2026, 5, 1))
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=5)
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
            method="BANK",
            reference_no="REC-SETTLE-PAY-001",
            payment_date=date(2026, 5, 2),
            collected_by=self.admin,
            finance_account=self.bank_account,
        )

    def _run(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={
                "date_from": "2026-05-01",
                "date_to": "2026-05-31",
                "branch_id": None,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        return int(resp.data["id"])

    def _codes(self, *, run_id: int) -> set[str]:
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}&module=settlement")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return {row["exception_code"] for row in resp.data.get("results", [])}

    def _bank_line(self, *, amount: Decimal, matched_status: str = LineMatchedStatus.UNMATCHED) -> BankStatementLine:
        imp = BankStatementImport.objects.create(
            bank_finance_account=self.bank_account,
            statement_period_from=date(2026, 5, 1),
            statement_period_to=date(2026, 5, 31),
            status=ImportStatus.PARSED,
            checksum="abc123",
        )
        return BankStatementLine.objects.create(
            statement_import=imp,
            transaction_date=date(2026, 5, 2),
            description="Test bank line",
            credit=amount,
            debit=Decimal("0.00"),
            matched_status=matched_status,
        )

    def _upi_line(self, *, net_amount: Decimal, matched_status: str = LineMatchedStatus.UNMATCHED) -> UpiSettlementLine:
        imp = UpiSettlementImport.objects.create(
            upi_finance_account=self.upi_account,
            settlement_date=date(2026, 5, 2),
            status=ImportStatus.PARSED,
            checksum="def456",
        )
        return UpiSettlementLine.objects.create(
            settlement_import=imp,
            transaction_ref="TXN-REC-001",
            gross_amount=net_amount,
            fee_amount=Decimal("0.00"),
            net_amount=net_amount,
            settlement_date=date(2026, 5, 2),
            matched_status=matched_status,
        )

    def test_unallocated_bank_line_creates_item(self):
        self._bank_line(amount=Decimal("1000.00"))
        run_id = self._run()
        self.assertIn("BANK_STATEMENT_LINE_UNALLOCATED", self._codes(run_id=run_id))

    def test_unallocated_upi_line_creates_item(self):
        self._upi_line(net_amount=Decimal("98.00"))
        run_id = self._run()
        self.assertIn("UPI_SETTLEMENT_LINE_UNALLOCATED", self._codes(run_id=run_id))

    def test_partial_allocation_creates_item_and_voided_allocations_excluded(self):
        line = self._bank_line(amount=Decimal("1000.00"))
        SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE,
            source_id=str(line.id),
            payment=self.payment,
            finance_account=self.bank_account,
            matched_amount=Decimal("400.00"),
            status=SettlementAllocationStatus.MATCHED,
            matched_by=self.admin,
        )
        SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE,
            source_id=str(line.id),
            payment=self.payment,
            finance_account=self.bank_account,
            matched_amount=Decimal("700.00"),
            status=SettlementAllocationStatus.VOIDED,
            matched_by=self.admin,
            metadata={"voided_at": "2026-05-02T10:00:00Z"},
        )

        before_allocations = SettlementAllocation.objects.count()
        before_line_status = BankStatementLine.objects.get(pk=line.id).matched_status

        run_id = self._run()
        codes = self._codes(run_id=run_id)
        self.assertIn("BANK_STATEMENT_LINE_PARTIALLY_ALLOCATED", codes)
        self.assertNotIn("BANK_STATEMENT_LINE_OVER_ALLOCATED", codes)

        self.assertEqual(SettlementAllocation.objects.count(), before_allocations)
        self.assertEqual(BankStatementLine.objects.get(pk=line.id).matched_status, before_line_status)

    def test_over_allocation_creates_item(self):
        line = self._bank_line(amount=Decimal("1000.00"))
        SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE,
            source_id=str(line.id),
            payment=self.payment,
            finance_account=self.bank_account,
            matched_amount=Decimal("600.00"),
            status=SettlementAllocationStatus.MATCHED,
            matched_by=self.admin,
        )
        SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE,
            source_id=str(line.id),
            payment=self.payment,
            finance_account=self.bank_account,
            matched_amount=Decimal("500.00"),
            status=SettlementAllocationStatus.MATCHED,
            matched_by=self.admin,
        )
        run_id = self._run()
        self.assertIn("BANK_STATEMENT_LINE_OVER_ALLOCATED", self._codes(run_id=run_id))

    def test_finance_account_mismatch_creates_item(self):
        line = self._bank_line(amount=Decimal("1000.00"))
        SettlementAllocation.objects.create(
            source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE,
            source_id=str(line.id),
            payment=self.payment,
            finance_account=self.bank_account_other,
            matched_amount=Decimal("1000.00"),
            status=SettlementAllocationStatus.MATCHED,
            matched_by=self.admin,
        )
        run_id = self._run()
        self.assertIn("SETTLEMENT_ALLOCATION_FINANCE_ACCOUNT_MISMATCH", self._codes(run_id=run_id))

    def test_matched_status_mismatch_creates_item(self):
        self._bank_line(amount=Decimal("1000.00"), matched_status=LineMatchedStatus.MATCHED)
        run_id = self._run()
        self.assertIn("BANK_STATEMENT_LINE_MATCH_STATUS_MISMATCH", self._codes(run_id=run_id))

    def test_cashier_day_close_variance_unresolved_creates_item(self):
        close = CashierDayClose.objects.create(
            cashier=self.admin,
            branch=None,
            cash_counter=None,
            finance_account=self.bank_account,
            business_date=date(2026, 5, 2),
            opening_cash=Decimal("0.00"),
            system_cash_total=Decimal("1000.00"),
            counted_cash=Decimal("990.00"),
            variance=Decimal("-10.00"),
            status="SUBMITTED",
        )

        before_allocations = SettlementAllocation.objects.count()
        before_close_variance = CashierDayClose.objects.get(pk=close.id).variance

        run_id = self._run()
        self.assertIn("CASHIER_DAY_CLOSE_VARIANCE_UNRESOLVED", self._codes(run_id=run_id))

        self.assertEqual(SettlementAllocation.objects.count(), before_allocations)
        self.assertEqual(CashierDayClose.objects.get(pk=close.id).variance, before_close_variance)

    def test_reconciliation_does_not_create_settlement_allocations_or_reconciliation_items_outside_detected(self):
        before_allocations = SettlementAllocation.objects.count()
        run_id = self._run()
        self.assertEqual(SettlementAllocation.objects.count(), before_allocations)
        self.assertTrue(ReconciliationItem.objects.filter(run_id=run_id).exists())

