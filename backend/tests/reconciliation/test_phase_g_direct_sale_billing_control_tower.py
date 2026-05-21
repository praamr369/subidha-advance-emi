from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, DocumentSequence, JournalEntry, JournalEntryStatus, JournalEntryType
from billing.models import BillingDocumentStatus, BillingInvoice, ReceiptDocument, ReceiptType
from branch_control.models import Branch
from reconciliation.models import ReconciliationItem
from tests.helpers import create_admin_user, create_customer_profile, create_customer_user, create_partner_user


class AdminReconciliationControlTowerPhaseGDirectSaleBillingTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="admin_phase_g", phone="9011000001")
        self.partner = create_partner_user(username="partner_phase_g", phone="9011000002")

        self.branch = Branch.objects.order_by("id").first()
        user_a = create_customer_user(username="phase_g_customer_a", phone="9011000100")
        user_b = create_customer_user(username="phase_g_customer_b", phone="9011000101")
        self.customer_a = create_customer_profile(user=user_a, name="PhaseG Customer A", phone="9011000100")
        self.customer_b = create_customer_profile(user=user_b, name="PhaseG Customer B", phone="9011000101")

        self.sequence = DocumentSequence.objects.create(
            series_code="BILL_INV",
            financial_year="2026-27",
            prefix="INV-2026-27",
            next_number=1,
        )
        self.cash_chart = ChartOfAccount.objects.create(
            code="PHG-CASH-001",
            name="PhaseG Cash",
            account_type=ChartOfAccountType.ASSET,
        )

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

    def test_admin_only_control_tower_still_applies(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={"date_from": "2026-04-01", "date_to": "2026-04-30"},
            format="json",
        )
        self.assertIn(resp.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED})

    def test_invoice_posted_missing_expected_journal_creates_item(self):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 12),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
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
            branch=self.branch,
        )

        BillingInvoice.objects.filter(pk=inv.id).update(status=BillingDocumentStatus.POSTED, posted_journal_entry=None)

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("BILLING_INVOICE_POSTED_JOURNAL_MISSING", exception_codes)

    def test_duplicate_invoice_journal_source_reference_creates_item(self):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 13),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            subtotal=Decimal("500.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("500.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("500.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
            branch=self.branch,
        )
        j1 = JournalEntry.objects.create(
            entry_date=inv.invoice_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Invoice posting",
            source_model="BillingInvoice",
            source_id=str(inv.id),
            voucher_type="SALES_INVOICE",
        )
        BillingInvoice.objects.filter(pk=inv.id).update(status=BillingDocumentStatus.POSTED, posted_journal_entry=j1)
        JournalEntry.objects.create(
            entry_date=inv.invoice_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Duplicate invoice posting",
            source_model="BillingInvoice",
            source_id=str(inv.id),
            voucher_type="SALES_INVOICE",
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("BILLING_INVOICE_DUPLICATE_JOURNAL_SOURCE_REFERENCE", exception_codes)

    def test_invalid_receipt_invoice_link_creates_item(self):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 14),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            subtotal=Decimal("200.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("200.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("200.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
            branch=self.branch,
        )

        ReceiptDocument.objects.create(
            receipt_no="PHG-RCT-001",
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=date(2026, 4, 14),
            branch=self.branch,
            billing_invoice=inv,
            customer=self.customer_b,  # mismatch vs invoice.customer
            amount=Decimal("50.00"),
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("RECEIPT_DOCUMENT_INVOICE_LINK_INVALID", exception_codes)

    def test_cancelled_or_void_outstanding_creates_item(self):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 15),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            subtotal=Decimal("300.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("300.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("300.00"),
            received_total=Decimal("0.00"),
            balance_total=Decimal("300.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
            branch=self.branch,
        )
        journal = JournalEntry.objects.create(
            entry_date=inv.invoice_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Invoice posting",
            source_model="BillingInvoice",
            source_id=str(inv.id),
            voucher_type="SALES_INVOICE",
        )
        BillingInvoice.objects.filter(pk=inv.id).update(
            status=BillingDocumentStatus.VOID,
            posted_journal_entry=journal,
            balance_total=Decimal("100.00"),
            received_total=Decimal("200.00"),
        )

        _, results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("BILLING_INVOICE_CANCELLED_OUTSTANDING", exception_codes)

    def test_phase_g_runner_does_not_mutate_source_records(self):
        inv = BillingInvoice.objects.create(
            invoice_date=date(2026, 4, 16),
            financial_year="2026-27",
            doc_series=self.sequence,
            customer=self.customer_a,
            billing_channel="RETAIL",
            tax_mode="NON_GST",
            subtotal=Decimal("400.00"),
            discount_total=Decimal("0.00"),
            taxable_total=Decimal("400.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("400.00"),
            received_total=Decimal("100.00"),
            balance_total=Decimal("300.00"),
            customer_name_snapshot=self.customer_a.name,
            customer_phone_snapshot=self.customer_a.phone,
            branch=self.branch,
        )

        before = BillingInvoice.objects.get(pk=inv.id)
        before_snapshot = {
            "status": before.status,
            "received_total": str(before.received_total),
            "balance_total": str(before.balance_total),
            "grand_total": str(before.grand_total),
            "posted_journal_entry_id": before.posted_journal_entry_id,
        }

        run_id, _ = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        self.assertTrue(run_id)

        after = BillingInvoice.objects.get(pk=inv.id)
        after_snapshot = {
            "status": after.status,
            "received_total": str(after.received_total),
            "balance_total": str(after.balance_total),
            "grand_total": str(after.grand_total),
            "posted_journal_entry_id": after.posted_journal_entry_id,
        }
        self.assertEqual(before_snapshot, after_snapshot)
