from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils.crypto import get_random_string

from accounting.models import JournalEntry, MoneyMovement
from services.subscriptions.create_subscription import create_subscription as create_emi_subscription
from subscriptions.models import (
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LuckyId,
    LuckyIdStatus,
    Payment,
    PaymentReconciliation,
    PlanType,
    Subscription,
)
from subscriptions.services.payment_service import record_emi_payment, reverse_payment_for_admin
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_finance_account,
    create_product,
)


def _token() -> str:
    return get_random_string(8, allowed_chars="0123456789abcdef")


def _admin():
    return create_admin_user(username=f"wf_admin_{_token()}", phone=f"90{_token()[:8]}")


def _customer(name="Workflow Customer"):
    token = _token()
    user = create_customer_user(
        username=f"wf_customer_{token}",
        phone=f"91{token[:8]}",
        email=f"wf-{token}@example.test",
    )
    return create_customer_profile(user=user, name=name, phone=user.phone, email=user.email)


def _product(*, code_prefix="WF-PROD", price=Decimal("15000.00")):
    token = _token().upper()
    return create_product(
        name=f"{code_prefix} Product {token}",
        product_code=f"{code_prefix}-{token}",
        base_price=Decimal(str(price)),
    )


def _batch(*, code_prefix="WF-BATCH"):
    return create_batch(
        batch_code=f"{code_prefix}-{_token().upper()}",
        duration_months=15,
        total_slots=100,
        draw_day=15,
        start_date=date(2026, 1, 1),
        status="OPEN",
    )


def _subscription(*, lucky_number=1, customer=None, product=None, batch=None, performed_by=None):
    return create_emi_subscription(
        customer=customer or _customer(),
        product=product or _product(),
        batch=batch or _batch(),
        lucky_number=lucky_number,
        tenure_months=15,
        start_date=date(2026, 1, 1),
        performed_by=performed_by,
    )


class LuckyPlanSubscriptionWorkflowTests(TestCase):
    def test_lucky_plan_creates_100_lucky_ids_and_15_emis(self):
        admin = _admin()
        batch = _batch()
        product = _product(price=Decimal("15000.00"))

        self.assertEqual(batch.lucky_ids.count(), 100)
        self.assertEqual(set(batch.lucky_ids.values_list("lucky_number", flat=True)), set(range(100)))

        first = _subscription(
            lucky_number=7,
            customer=_customer("Lucky Customer 1"),
            product=product,
            batch=batch,
            performed_by=admin,
        )
        self.assertEqual(first.plan_type, PlanType.EMI)
        self.assertEqual(first.total_amount, Decimal("15000.00"))
        self.assertEqual(first.monthly_amount, Decimal("1000.00"))
        self.assertEqual(first.emis.count(), 15)
        self.assertEqual(first.lucky_id.lucky_number, 7)
        first.lucky_id.refresh_from_db()
        self.assertEqual(first.lucky_id.status, LuckyIdStatus.ASSIGNED)

        second = _subscription(
            lucky_number=8,
            customer=_customer("Lucky Customer 2"),
            product=product,
            batch=batch,
            performed_by=admin,
        )
        self.assertNotEqual(first.lucky_id_id, second.lucky_id_id)
        self.assertEqual(Subscription.objects.filter(batch=batch, plan_type=PlanType.EMI).count(), 2)

    def test_duplicate_lucky_id_is_rejected_without_creating_second_subscription(self):
        admin = _admin()
        batch = _batch(code_prefix="WF-DUP")
        product = _product(code_prefix="WF-DUP-P")
        _subscription(
            lucky_number=22,
            customer=_customer("Original Lucky Customer"),
            product=product,
            batch=batch,
            performed_by=admin,
        )

        before_count = Subscription.objects.count()
        with self.assertRaises(ValidationError):
            _subscription(
                lucky_number=22,
                customer=_customer("Duplicate Lucky Customer"),
                product=product,
                batch=batch,
                performed_by=admin,
            )

        self.assertEqual(Subscription.objects.count(), before_count)
        self.assertEqual(LuckyId.objects.get(batch=batch, lucky_number=22).status, LuckyIdStatus.ASSIGNED)


class EmiPaymentWorkflowTests(TestCase):
    def setUp(self):
        self.admin = _admin()
        self.subscription = _subscription(lucky_number=3, performed_by=self.admin)
        self.cash_account = create_finance_account(
            code=f"WF-CASH-{_token().upper()}",
            name=f"Workflow Cash {_token()}",
            kind="CASH",
        )
        self.upi_account = create_finance_account(
            code=f"WF-UPI-{_token().upper()}",
            name=f"Workflow UPI {_token()}",
            kind="UPI",
        )

    def test_cash_and_upi_collection_marks_emis_paid_and_creates_financial_records(self):
        cash_emi = self.subscription.emis.get(month_no=1)
        cash_result = record_emi_payment(
            emi_id=cash_emi.id,
            amount=cash_emi.amount,
            collected_by=self.admin,
            method="CASH",
            reference_no=f"WF-CASH-{_token()}",
            finance_account_id=self.cash_account.id,
        )
        cash_emi.refresh_from_db()
        self.assertTrue(cash_result["created"])
        self.assertEqual(cash_emi.status, EmiStatus.PAID)
        self.assertTrue(Payment.objects.filter(emi=cash_emi, method="CASH").exists())
        self.assertTrue(
            FinancialLedger.objects.filter(
                emi=cash_emi,
                payment=cash_result["payment"],
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).exists()
        )
        self.assertTrue(PaymentReconciliation.objects.filter(payment=cash_result["payment"]).exists())

        upi_emi = self.subscription.emis.get(month_no=2)
        upi_result = record_emi_payment(
            emi_id=upi_emi.id,
            amount=upi_emi.amount,
            collected_by=self.admin,
            method="UPI",
            reference_no=f"WF-UPI-{_token()}",
            finance_account_id=self.upi_account.id,
        )
        upi_emi.refresh_from_db()
        self.assertTrue(upi_result["created"])
        self.assertEqual(upi_emi.status, EmiStatus.PAID)
        self.assertTrue(Payment.objects.filter(emi=upi_emi, method="UPI").exists())
        self.assertGreaterEqual(JournalEntry.objects.count() + MoneyMovement.objects.count(), 1)

    def test_duplicate_reference_and_overpayment_are_blocked_without_extra_payment_rows(self):
        emi = self.subscription.emis.get(month_no=3)
        reference_no = f"WF-DUP-{_token()}"
        first = record_emi_payment(
            emi_id=emi.id,
            amount=emi.amount,
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
            finance_account_id=self.cash_account.id,
        )
        payment_count = Payment.objects.count()

        same_payload = record_emi_payment(
            emi_id=emi.id,
            amount=emi.amount,
            collected_by=self.admin,
            method="CASH",
            reference_no=reference_no,
            finance_account_id=self.cash_account.id,
        )
        self.assertFalse(same_payload["created"])
        self.assertEqual(first["payment"].id, same_payload["payment"].id)
        self.assertEqual(Payment.objects.count(), payment_count)

        next_emi = self.subscription.emis.get(month_no=4)
        with self.assertRaisesMessage(ValueError, "Payment amount cannot exceed the EMI outstanding balance"):
            record_emi_payment(
                emi_id=next_emi.id,
                amount=next_emi.amount + Decimal("1.00"),
                collected_by=self.admin,
                method="UPI",
                reference_no=f"WF-OVER-{_token()}",
                finance_account_id=self.upi_account.id,
            )
        self.assertEqual(Payment.objects.count(), payment_count)

    def test_payment_reversal_keeps_original_payment_and_restores_emi_auditably(self):
        emi = self.subscription.emis.get(month_no=5)
        result = record_emi_payment(
            emi_id=emi.id,
            amount=emi.amount,
            collected_by=self.admin,
            method="CASH",
            reference_no=f"WF-REV-{_token()}",
            finance_account_id=self.cash_account.id,
        )
        payment = result["payment"]
        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="production readiness reversal regression",
        )
        payment.refresh_from_db()
        emi.refresh_from_db()

        self.assertTrue(Payment.objects.filter(id=payment.id).exists())
        self.assertTrue(payment.allocation_metadata.get("reversal", {}).get("is_reversed"))
        self.assertEqual(emi.status, EmiStatus.PENDING)
        self.assertTrue(
            FinancialLedger.objects.filter(
                emi=emi,
                payment=payment,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).exists()
        )
