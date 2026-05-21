from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    JournalEntry,
    JournalEntryStatus,
    JournalEntryType,
)
from billing.models import (
    BillingDocumentStatus,
    BillingInvoice,
    CustomerRefund,
    CustomerRefundStatus,
    DirectSale,
    DirectSaleReturn,
    DirectSaleReturnStatus,
    RefundMethod,
)
from branch_control.models import Branch
from tests.helpers import create_admin_user, create_customer_profile, create_customer_user

from accounting.models import FinanceAccount


class AdminReconciliationControlTowerPhaseHReturnsRefundsTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="admin_phase_h", phone="9011000201")

        self.branch = Branch.objects.order_by("id").first()
        user_a = create_customer_user(username="phase_h_customer_a", phone="9011000202")
        user_b = create_customer_user(username="phase_h_customer_b", phone="9011000203")
        self.customer_a = create_customer_profile(user=user_a, name="PhaseH Customer A", phone="9011000202")
        self.customer_b = create_customer_profile(user=user_b, name="PhaseH Customer B", phone="9011000203")

        self.sequence = DocumentSequence.objects.create(
            series_code="PHH-SEQ",
            financial_year="2026-27",
            prefix="PHH-2026-27",
            next_number=1,
        )
        self.cash_chart = ChartOfAccount.objects.create(
            code="PHH-CASH-001",
            name="PhaseH Cash",
            account_type=ChartOfAccountType.ASSET,
        )
        self.finance_account = FinanceAccount.objects.order_by("id").first()
        self.assertIsNotNone(self.finance_account)

    def _run_control_tower(self, *, date_from: str, date_to: str):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={"date_from": date_from, "date_to": date_to, "branch_id": self.branch.id if self.branch else None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        run_id = resp.data["id"]
        items_resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}")
        self.assertEqual(items_resp.status_code, status.HTTP_200_OK)
        return run_id, items_resp.data.get("results", [])

    def _make_direct_sale(self) -> DirectSale:
        return DirectSale.objects.create(
            sale_no="PHH-SALE-001",
            sale_date=date(2026, 4, 10),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            branch=self.branch,
            status="INVOICED",
            tax_mode="NON_GST",
            tax_calculation_mode="NON_GST",
            customer_gst_type="UNREGISTERED_CONSUMER",
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("1000.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
        )

    def _make_invoice(self, *, direct_sale: DirectSale) -> BillingInvoice:
        return BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 10),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            direct_sale=direct_sale,
            branch=self.branch,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("1000.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
        )

    def test_posted_direct_sale_return_missing_credit_note_creates_item(self):
        sale = self._make_direct_sale()
        inv = self._make_invoice(direct_sale=sale)
        ret = DirectSaleReturn.objects.create(
            return_no="PHH-RET-001",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer_a,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            reason="Return test",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            stock_effect=False,
            metadata={"financial_mode": "STANDARD_REVERSAL"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 11, 10, 0, 0)),
        )
        self.assertIsNotNone(ret.id)

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("DIRECT_SALE_RETURN_CREDIT_NOTE_MISSING", exception_codes)

    def test_paid_customer_refund_missing_expected_journal_creates_item(self):
        sale = self._make_direct_sale()
        inv = self._make_invoice(direct_sale=sale)
        ret = DirectSaleReturn.objects.create(
            return_no="PHH-RET-002",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer_a,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            reason="Return test 2",
            subtotal=Decimal("200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("200.00"),
            stock_effect=False,
            metadata={"financial_mode": "NO_ACTIVE_CUSTOMER_VALUE"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 12, 10, 0, 0)),
        )
        refund = CustomerRefund.objects.create(
            refund_no="PHH-REF-001",
            customer=self.customer_a,
            direct_sale_return=ret,
            amount=Decimal("50.00"),
            method=RefundMethod.CASH_REFUND,
            finance_account=self.finance_account,
            status=CustomerRefundStatus.DRAFT,
            reason="Refund test",
        )
        CustomerRefund.objects.filter(pk=refund.id).update(
            status=CustomerRefundStatus.PAID,
            paid_by=self.admin,
            paid_at=timezone.make_aware(datetime(2026, 4, 12, 12, 0, 0)),
            posted_journal_entry=None,
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("CUSTOMER_REFUND_PAID_JOURNAL_MISSING", exception_codes)

    def test_duplicate_customer_refund_journal_source_reference_creates_item(self):
        sale = self._make_direct_sale()
        inv = self._make_invoice(direct_sale=sale)
        ret = DirectSaleReturn.objects.create(
            return_no="PHH-RET-003",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer_a,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            reason="Return test 3",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            stock_effect=False,
            metadata={"financial_mode": "NO_ACTIVE_CUSTOMER_VALUE"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 13, 10, 0, 0)),
        )
        refund = CustomerRefund.objects.create(
            refund_no="PHH-REF-002",
            customer=self.customer_a,
            direct_sale_return=ret,
            amount=Decimal("10.00"),
            method=RefundMethod.CASH_REFUND,
            finance_account=self.finance_account,
            status=CustomerRefundStatus.PAID,
            reason="Refund dup journal",
            paid_by=self.admin,
            paid_at=timezone.make_aware(datetime(2026, 4, 13, 12, 0, 0)),
        )

        j1 = JournalEntry.objects.create(
            entry_date=date(2026, 4, 12),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Refund posting 1",
            source_model="CustomerRefund",
            source_id=str(refund.id),
            voucher_type="CUSTOMER_REFUND",
        )
        JournalEntry.objects.create(
            entry_date=date(2026, 4, 12),
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Refund posting 2",
            source_model="CustomerRefund",
            source_id=str(refund.id),
            voucher_type="CUSTOMER_REFUND",
        )
        CustomerRefund.objects.filter(pk=refund.id).update(posted_journal_entry=j1)

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("CUSTOMER_REFUND_DUPLICATE_JOURNAL_SOURCE_REFERENCE", exception_codes)

    def test_phase_h_runner_does_not_mutate_source_records(self):
        sale = self._make_direct_sale()
        inv = self._make_invoice(direct_sale=sale)
        ret = DirectSaleReturn.objects.create(
            return_no="PHH-RET-004",
            direct_sale=sale,
            original_invoice=inv,
            customer=self.customer_b,
            status=DirectSaleReturnStatus.POSTED,
            return_kind="DELIVERED_RETURN",
            stock_destination="SELLABLE",
            reason="Return mutation safety",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            stock_effect=False,
            metadata={"financial_mode": "STANDARD_REVERSAL"},
            posted_by=self.admin,
            posted_at=timezone.make_aware(datetime(2026, 4, 14, 10, 0, 0)),
        )

        before_snapshot = {
            "customer_id": ret.customer_id,
            "original_invoice_id": ret.original_invoice_id,
            "credit_note_id": ret.credit_note_id,
            "status": ret.status,
            "grand_total": str(ret.grand_total),
            "metadata": dict(ret.metadata or {}),
        }

        run_id, _ = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        self.assertTrue(run_id)

        after = DirectSaleReturn.objects.get(pk=ret.id)
        after_snapshot = {
            "customer_id": after.customer_id,
            "original_invoice_id": after.original_invoice_id,
            "credit_note_id": after.credit_note_id,
            "status": after.status,
            "grand_total": str(after.grand_total),
            "metadata": dict(after.metadata or {}),
        }
        self.assertEqual(before_snapshot, after_snapshot)
