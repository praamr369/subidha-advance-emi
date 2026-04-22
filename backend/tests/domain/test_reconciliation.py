from decimal import Decimal
from datetime import date

from django.db.models import Sum
from django.test import TestCase

from subscriptions.models import FinancialLedger, LedgerEntryType
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
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


class ReconciliationTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="recon_admin", phone="9000000401")
        self.partner = create_partner_user(username="recon_partner", phone="9000000402")

        self.customer = create_customer_profile(
            name="Reconciliation Customer",
            phone="7407533399",
        )
        self.product = create_product(
            name="Recon Product",
            product_code="RECON-001",
            base_price=Decimal("3000.00"),
        )
        self.batch = create_batch(
            batch_code="RECON2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )
        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=21)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.lucky_id,
            partner=self.partner,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

        self.emi_1 = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 7),
        )
        self.emi_2 = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1000.00"),
            due_date=date(2026, 4, 7),
        )
        self.emi_3 = create_emi(
            subscription=self.subscription,
            month_no=3,
            amount=Decimal("1000.00"),
            due_date=date(2026, 5, 7),
        )
        self.finance_account = create_finance_account(
            code="TEST-RECON-001",
            name="Reconciliation Cash",
        )

    def _sum_ledger_amount(self, *, emi, entry_type):
        return (
            FinancialLedger.objects.filter(
                emi=emi,
                entry_type=entry_type,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

    def _emi_net_paid(self, emi):
        payment_total = self._sum_ledger_amount(
            emi=emi,
            entry_type=LedgerEntryType.EMI_PAYMENT,
        )
        reversal_total = self._sum_ledger_amount(
            emi=emi,
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        )
        net = Decimal(str(payment_total)) - Decimal(str(reversal_total))
        return max(net, Decimal("0.00"))

    def test_ledger_net_paid_after_single_payment(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-001",
        )

        self.emi_1.refresh_from_db()

        self.assertEqual(
            self._sum_ledger_amount(
                emi=self.emi_1,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ),
            Decimal("1000.00"),
        )
        self.assertEqual(
            self._sum_ledger_amount(
                emi=self.emi_1,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ),
            Decimal("0.00"),
        )
        self.assertEqual(self._emi_net_paid(self.emi_1), Decimal("1000.00"))
        self.assertEqual(self.emi_1.status, "PAID")

    def test_ledger_net_paid_becomes_zero_after_reversal(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-002",
        )
        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="reconciliation reversal",
        )

        self.emi_1.refresh_from_db()

        self.assertEqual(
            self._sum_ledger_amount(
                emi=self.emi_1,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ),
            Decimal("1000.00"),
        )
        self.assertEqual(
            self._sum_ledger_amount(
                emi=self.emi_1,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ),
            Decimal("1000.00"),
        )
        self.assertEqual(self._emi_net_paid(self.emi_1), Decimal("0.00"))
        self.assertEqual(self.emi_1.status, "PENDING")

    def test_reversal_keeps_payment_record_but_zeroes_financial_effect(self):
        result = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-003",
        )
        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="reversal keeps history",
        )

        payment.refresh_from_db()

        reversal = payment.allocation_metadata.get("reversal", {})
        self.assertTrue(reversal.get("is_reversed"))
        self.assertEqual(self._emi_net_paid(self.emi_1), Decimal("0.00"))

    def test_subscription_stays_active_when_some_emis_are_still_pending(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-004",
        )

        self.subscription.refresh_from_db()

        self.assertEqual(self.subscription.status, "ACTIVE")

    def test_subscription_becomes_completed_when_all_emis_are_paid(self):
        record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-005",
        )
        record_emi_payment(
            emi_id=self.emi_2.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-006",
        )
        record_emi_payment(
            emi_id=self.emi_3.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-007",
        )

        self.subscription.refresh_from_db()

        self.assertEqual(self.subscription.status, "COMPLETED")

    def test_subscription_returns_to_active_after_reversing_one_paid_emi(self):
        pay_1 = record_emi_payment(
            emi_id=self.emi_1.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-008",
        )
        record_emi_payment(
            emi_id=self.emi_2.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-009",
        )
        record_emi_payment(
            emi_id=self.emi_3.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            finance_account_id=self.finance_account.id,
            reference_no="RECON-PAY-010",
        )

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, "COMPLETED")

        reverse_payment_for_admin(
            payment_id=pay_1["payment"].id,
            reversed_by=self.admin,
            reason="reopen one emi",
        )

        self.subscription.refresh_from_db()
        self.emi_1.refresh_from_db()

        self.assertEqual(self.emi_1.status, "PENDING")
        self.assertEqual(self.subscription.status, "ACTIVE")
