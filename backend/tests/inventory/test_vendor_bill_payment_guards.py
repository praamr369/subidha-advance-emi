"""
Tests for VendorBill and VendorPayment immutability guards and clean() validation.

POSTED and CANCELLED vendor bills/payments must not be mutated through direct
ORM saves. grand_total must equal subtotal + tax_total on VendorBill.
POSTED records must carry a posted_journal_entry reference.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, FinanceAccount, FinanceAccountKind, Vendor
from inventory.models import (
    VendorBill,
    VendorBillStatus,
    VendorPayment,
    VendorPaymentStatus,
)
from tests.helpers import create_admin_user


class VendorBillGuardTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vbill_guard_admin", phone="9370000001")
        self.vendor = Vendor.objects.create(name="VBill Guard Vendor", phone="9370000002")
        bank_chart = ChartOfAccount.objects.create(
            code="VBG-BANK-001",
            name="VBill Guard Bank",
            account_type=ChartOfAccountType.ASSET,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="VBill Guard Finance Account",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
        )

    def _make_draft_bill(self, subtotal=Decimal("1000.00"), tax=Decimal("180.00")):
        return VendorBill.objects.create(
            bill_no=f"VBILL-{VendorBill.objects.count() + 1:04d}",
            bill_date="2026-06-01",
            vendor=self.vendor,
            finance_account=self.finance_account,
            status=VendorBillStatus.DRAFT,
            subtotal=subtotal,
            tax_total=tax,
            grand_total=subtotal + tax,
        )

    def test_grand_total_must_equal_subtotal_plus_tax(self):
        """VendorBill.clean() must reject grand_total != subtotal + tax_total."""
        bill = self._make_draft_bill()
        bill.grand_total = Decimal("9999.00")  # deliberately wrong
        with self.assertRaises(ValidationError) as ctx:
            bill.save()
        self.assertIn("grand_total", str(ctx.exception))

    def test_draft_bill_can_be_edited(self):
        """DRAFT vendor bills are freely editable."""
        bill = self._make_draft_bill()
        bill.notes = "Updated notes"
        bill.save()  # must not raise

        bill.refresh_from_db()
        self.assertEqual(bill.notes, "Updated notes")

    def test_posted_bill_cannot_be_cancelled_via_direct_save(self):
        """A POSTED VendorBill must not be moved to CANCELLED through a direct ORM save."""
        bill = self._make_draft_bill()
        # Simulate POSTED by setting status directly (bypassing the guard on first save)
        VendorBill.objects.filter(pk=bill.pk).update(status=VendorBillStatus.POSTED)
        bill.refresh_from_db()
        self.assertEqual(bill.status, VendorBillStatus.POSTED)

        bill.status = VendorBillStatus.CANCELLED
        with self.assertRaises(ValidationError):
            bill.save()

        bill.refresh_from_db()
        self.assertEqual(bill.status, VendorBillStatus.POSTED)

    def test_cancelled_bill_cannot_be_reopened(self):
        """A CANCELLED VendorBill must remain immutable."""
        bill = self._make_draft_bill()
        VendorBill.objects.filter(pk=bill.pk).update(status=VendorBillStatus.CANCELLED)
        bill.refresh_from_db()

        bill.status = VendorBillStatus.DRAFT
        with self.assertRaises(ValidationError):
            bill.save()

    def test_posted_bill_without_journal_fails_clean(self):
        """A VendorBill with status=POSTED must have a posted_journal_entry."""
        bill = self._make_draft_bill()
        bill.status = VendorBillStatus.POSTED
        bill.posted_journal_entry = None
        with self.assertRaises(ValidationError) as ctx:
            bill.save()
        self.assertIn("posted_journal_entry", str(ctx.exception))


class VendorPaymentGuardTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="vpay_guard_admin", phone="9380000001")
        self.vendor = Vendor.objects.create(name="VPay Guard Vendor", phone="9380000002")
        bank_chart = ChartOfAccount.objects.create(
            code="VPG-BANK-001",
            name="VPay Guard Bank",
            account_type=ChartOfAccountType.ASSET,
        )
        self.finance_account = FinanceAccount.objects.create(
            name="VPay Guard Finance Account",
            kind=FinanceAccountKind.BANK,
            chart_account=bank_chart,
            opening_balance=Decimal("0.00"),
        )

    def _make_draft_payment(self):
        return VendorPayment.objects.create(
            payment_no=f"VPAY-{VendorPayment.objects.count() + 1:04d}",
            payment_date="2026-06-01",
            vendor=self.vendor,
            amount=Decimal("500.00"),
            finance_account=self.finance_account,
            status=VendorPaymentStatus.DRAFT,
        )

    def test_zero_amount_vendor_payment_rejected(self):
        """VendorPayment.clean() must reject amount <= 0."""
        payment = self._make_draft_payment()
        payment.amount = Decimal("0.00")
        with self.assertRaises(ValidationError) as ctx:
            payment.save()
        self.assertIn("amount", str(ctx.exception))

    def test_posted_payment_cannot_be_cancelled_via_direct_save(self):
        """A POSTED VendorPayment must not be moved to CANCELLED through direct ORM save."""
        payment = self._make_draft_payment()
        VendorPayment.objects.filter(pk=payment.pk).update(status=VendorPaymentStatus.POSTED)
        payment.refresh_from_db()
        self.assertEqual(payment.status, VendorPaymentStatus.POSTED)

        payment.status = VendorPaymentStatus.CANCELLED
        with self.assertRaises(ValidationError):
            payment.save()

        payment.refresh_from_db()
        self.assertEqual(payment.status, VendorPaymentStatus.POSTED)

    def test_posted_payment_without_journal_fails_clean(self):
        """A VendorPayment with status=POSTED must have a posted_journal_entry."""
        payment = self._make_draft_payment()
        payment.status = VendorPaymentStatus.POSTED
        payment.posted_journal_entry = None
        with self.assertRaises(ValidationError) as ctx:
            payment.save()
        self.assertIn("posted_journal_entry", str(ctx.exception))
