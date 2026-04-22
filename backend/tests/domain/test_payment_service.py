from decimal import Decimal

from django.test import TestCase

from subscriptions.models import Commission, FinancialLedger, LedgerEntryType, Payment
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
    verify_payment,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_finance_account,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class PaymentServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user()
        self.partner = create_partner_user()
        self.customer = create_customer_profile(name="Amrita", phone="7407533262")
        self.product = create_product(base_price=Decimal("15000.00"))
        self.batch = create_batch()
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=4)
        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1000.00"),
        )
        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
        )
        self.finance_account = create_finance_account(
            code="TEST-PAY-SVC-001",
            name="Payment Service Cash",
        )

    def test_record_emi_payment_success(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-001",
        )

        payment = result["payment"]
        self.emi.refresh_from_db()
        self.subscription.refresh_from_db()

        self.assertTrue(result["created"])
        self.assertEqual(payment.amount, Decimal("1000.00"))
        self.assertEqual(payment.reference_no, "TEST-REF-001")
        self.assertEqual(self.emi.status, "PAID")
        self.assertEqual(self.subscription.status, "COMPLETED")

        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(
            FinancialLedger.objects.filter(
                emi=self.emi,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).count(),
            1,
        )

    def test_record_emi_payment_duplicate_reference_returns_existing(self):
        first = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-002",
        )
        second = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-002",
        )

        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["payment"].id, second["payment"].id)
        self.assertEqual(Payment.objects.count(), 1)

    def test_record_emi_payment_duplicate_reference_mismatch_fails(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-003",
        )

        with self.assertRaisesMessage(
            ValueError,
            "A payment with this reference number already exists with different details.",
        ):
            record_emi_payment(
                emi_id=self.emi.id,
                amount=Decimal("900.00"),
                collected_by=self.admin,
                method="CASH",
                finance_account_id=self.finance_account.id,
                reference_no="TEST-REF-003",
            )

    def test_record_payment_on_paid_emi_fails(self):
        record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-004",
        )

        with self.assertRaises(ValueError) as ctx:
            record_emi_payment(
                emi_id=self.emi.id,
                amount=Decimal("1000.00"),
                collected_by=self.admin,
                method="CASH",
                finance_account_id=self.finance_account.id,
                reference_no="TEST-REF-005",
            )

        self.assertIn(
            str(ctx.exception),
            {
            "This EMI is already fully paid.",
            "Cannot collect payment for a completed subscription.",
            },
        )

    def test_reverse_payment_success(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-006",
        )
        payment = result["payment"]

        reverse_result = reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="test reversal",
        )

        payment.refresh_from_db()
        self.emi.refresh_from_db()

        reversal = payment.allocation_metadata.get("reversal", {})
        self.assertTrue(reversal.get("is_reversed"))
        self.assertEqual(self.emi.status, "PENDING")
        self.assertEqual(reverse_result["detail"], "Payment reversed successfully.")

        self.assertEqual(
            FinancialLedger.objects.filter(
                emi=self.emi,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).count(),
            1,
        )

    def test_second_reverse_fails(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-007",
        )
        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="first reversal",
        )

        with self.assertRaisesMessage(ValueError, "Payment is already reversed."):
            reverse_payment_for_admin(
                payment_id=payment.id,
                reversed_by=self.admin,
                reason="second reversal",
            )

    def test_verify_payment_backfills_commission_if_missing(self):
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="TEST-REF-008",
        )
        payment = result["payment"]

        Commission.objects.filter(payment=payment).delete()
        self.assertFalse(Commission.objects.filter(payment=payment).exists())

        verify_payment(payment_id=payment.id, verified_by=self.admin)

        self.assertTrue(Commission.objects.filter(payment=payment).exists())
