from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounting.models import JournalEntry, JournalEntryStatus, JournalEntryType, Vendor
from billing.models import PurchaseReturn, PurchaseReturnStatus
from inventory.models import (
    PurchaseBill,
    PurchaseBillStatus,
    VendorBill,
    VendorBillStatus,
    VendorPayment,
    VendorPaymentStatus,
)
from tests.helpers import create_admin_user, create_finance_account


class AdminReconciliationControlTowerPhaseJVendorPayableTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="admin_phase_j_vendor", phone="9011000401")
        self.vendor = Vendor.objects.create(name="Phase J Vendor", phone="9800000001")
        self.finance_account = create_finance_account(code="PHJ-FIN-001", name="Phase J Cash", kind="CASH")

    def _run_control_tower(self, *, date_from: str, date_to: str):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/runs/",
            data={"date_from": date_from, "date_to": date_to, "branch_id": None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        run_id = resp.data["id"]
        items_resp = self.client.get(f"/api/v1/admin/reconciliation/items/?run={run_id}")
        self.assertEqual(items_resp.status_code, status.HTTP_200_OK)
        return items_resp.data.get("results", [])

    def test_purchase_bill_posted_missing_journal_creates_item(self):
        bill = PurchaseBill.objects.create(
            bill_no="PHJ-PB-001",
            bill_date=date(2026, 4, 10),
            vendor=self.vendor,
            status=PurchaseBillStatus.POSTED,
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
            notes="test",
        )

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("PURCHASE_BILL_POSTED_JOURNAL_MISSING", exception_codes)

        bill.refresh_from_db()
        self.assertIsNone(bill.posted_journal_entry_id)

    def test_purchase_bill_invalid_journal_source_creates_item(self):
        bill = PurchaseBill.objects.create(
            bill_no="PHJ-PB-002",
            bill_date=date(2026, 4, 11),
            vendor=self.vendor,
            status=PurchaseBillStatus.POSTED,
            subtotal=Decimal("500.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("500.00"),
        )
        journal = JournalEntry.objects.create(
            entry_date=bill.bill_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase J purchase bill posting",
            source_model="VendorBill",
            source_id=str(bill.id),
            voucher_type="PURCHASE_BILL",
        )
        PurchaseBill.objects.filter(pk=bill.id).update(posted_journal_entry=journal)

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("PURCHASE_BILL_JOURNAL_SOURCE_LINK_INVALID", exception_codes)

    def test_purchase_bill_duplicate_journal_source_creates_item(self):
        bill = PurchaseBill.objects.create(
            bill_no="PHJ-PB-003",
            bill_date=date(2026, 4, 12),
            vendor=self.vendor,
            status=PurchaseBillStatus.POSTED,
            subtotal=Decimal("200.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("200.00"),
        )
        JournalEntry.objects.create(
            entry_date=bill.bill_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase J purchase bill posting #1",
            source_model="PurchaseBill",
            source_id=str(bill.id),
            voucher_type="PURCHASE_BILL",
        )
        JournalEntry.objects.create(
            entry_date=bill.bill_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase J purchase bill posting #2",
            source_model="PurchaseBill",
            source_id=str(bill.id),
            voucher_type="PURCHASE_BILL",
        )

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("PURCHASE_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE", exception_codes)

    def test_vendor_bill_missing_and_invalid_journal_are_detected(self):
        missing = VendorBill.objects.create(
            bill_no="PHJ-VB-001",
            bill_date=date(2026, 4, 13),
            vendor=self.vendor,
            finance_account=self.finance_account,
            status=VendorBillStatus.POSTED,
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
        )
        invalid = VendorBill.objects.create(
            bill_no="PHJ-VB-002",
            bill_date=date(2026, 4, 14),
            vendor=self.vendor,
            finance_account=self.finance_account,
            status=VendorBillStatus.POSTED,
            subtotal=Decimal("150.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("150.00"),
        )
        journal = JournalEntry.objects.create(
            entry_date=invalid.bill_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase J vendor bill posting (invalid link)",
            source_model="PurchaseBill",
            source_id=str(invalid.id),
            voucher_type="VENDOR_BILL",
        )
        VendorBill.objects.filter(pk=invalid.id).update(posted_journal_entry=journal)

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("VENDOR_BILL_POSTED_JOURNAL_MISSING", exception_codes)
        self.assertIn("VENDOR_BILL_JOURNAL_SOURCE_LINK_INVALID", exception_codes)

        missing.refresh_from_db()
        self.assertIsNone(missing.posted_journal_entry_id)

    def test_vendor_payment_missing_and_invalid_journal_are_detected(self):
        missing = VendorPayment.objects.create(
            payment_no="PHJ-VPAY-001",
            payment_date=date(2026, 4, 15),
            vendor=self.vendor,
            amount=Decimal("50.00"),
            finance_account=self.finance_account,
            status=VendorPaymentStatus.POSTED,
        )
        invalid = VendorPayment.objects.create(
            payment_no="PHJ-VPAY-002",
            payment_date=date(2026, 4, 16),
            vendor=self.vendor,
            amount=Decimal("75.00"),
            finance_account=self.finance_account,
            status=VendorPaymentStatus.POSTED,
        )
        journal = JournalEntry.objects.create(
            entry_date=invalid.payment_date,
            entry_type=JournalEntryType.SYSTEM_BRIDGE,
            status=JournalEntryStatus.POSTED,
            posted_at=timezone.now(),
            memo="Phase J vendor payment posting (invalid link)",
            source_model="VendorBill",
            source_id=str(invalid.id),
            voucher_type="VENDOR_PAYMENT",
        )
        VendorPayment.objects.filter(pk=invalid.id).update(posted_journal_entry=journal)

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("VENDOR_PAYMENT_POSTED_JOURNAL_MISSING", exception_codes)
        self.assertIn("VENDOR_PAYMENT_JOURNAL_SOURCE_LINK_INVALID", exception_codes)

        missing.refresh_from_db()
        self.assertIsNone(missing.posted_journal_entry_id)

    def test_purchase_return_posted_missing_journal_creates_item(self):
        bill = PurchaseBill.objects.create(
            bill_no="PHJ-PB-010",
            bill_date=date(2026, 4, 5),
            vendor=self.vendor,
            status=PurchaseBillStatus.POSTED,
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("1000.00"),
        )
        ret = PurchaseReturn.objects.create(
            return_no="PHJ-PR-001",
            purchase_bill=bill,
            vendor=self.vendor,
            status=PurchaseReturnStatus.POSTED,
            return_date=date(2026, 4, 20),
            reason="test",
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            grand_total=Decimal("100.00"),
            posted_journal_entry=None,
        )

        results = self._run_control_tower(date_from="2026-04-01", date_to="2026-04-30")
        exception_codes = {row["exception_code"] for row in results}
        self.assertIn("PURCHASE_RETURN_POSTED_JOURNAL_MISSING", exception_codes)

        ret.refresh_from_db()
        self.assertIsNone(ret.posted_journal_entry_id)

