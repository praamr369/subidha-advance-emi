from decimal import Decimal
from datetime import date

from django.core.management import call_command
from django.test import TestCase

from subscriptions.models import Commission, CommissionStatus, EmiStatus
from subscriptions.services.commission_service import create_commission_for_payment
from subscriptions.services.payment_service import (
    record_emi_payment,
    reverse_payment_for_admin,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_emi,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class CommissionServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="commission_admin", phone="9100000001")

        self.partner = create_partner_user(
            username="commission_partner",
            phone="9100000002",
        )
        self.partner.commission_rate = Decimal("5.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Commission Customer",
            phone="7407000001",
        )

        self.product = create_product(
            name="Commission Product",
            product_code="COM-001",
            base_price=Decimal("3000.00"),
        )

        self.batch = create_batch(
            batch_code="COMMISSION2026",
            duration_months=3,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=11)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 7),
        )

    def test_payment_creates_commission_for_partner_subscription(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-001",
        )

        payment = result["payment"]

        commission = Commission.objects.get(payment=payment)

        self.assertEqual(commission.partner_id, self.partner.id)
        self.assertEqual(commission.subscription_id, self.subscription.id)
        self.assertEqual(commission.emi_id, self.emi.id)
        self.assertEqual(commission.commission_rate, Decimal("5.00"))
        self.assertEqual(commission.commission_amount, Decimal("50.00"))
        self.assertEqual(commission.status, CommissionStatus.PENDING)

    def test_payment_without_partner_creates_no_commission(self):
        lucky_id_2 = create_lucky_id(batch=self.batch, lucky_number=12)

        subscription_without_partner = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=None,
            batch=self.batch,
            lucky_id=lucky_id_2,
            total_amount=Decimal("3000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=3,
        )

        emi_without_partner = create_emi(
            subscription=subscription_without_partner,
            month_no=1,
            amount=Decimal("1000.00"),
            due_date=date(2026, 3, 8),
        )

        result = record_emi_payment(
            emi_id=emi_without_partner.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-002",
        )

        payment = result["payment"]

        self.assertFalse(
            Commission.objects.filter(payment=payment).exists(),
            msg="Commission should not be created for subscription without partner.",
        )

    def test_zero_rate_partner_creates_no_commission(self):
        self.partner.commission_rate = Decimal("0.00")
        self.partner.save(update_fields=["commission_rate"])

        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-003",
        )

        payment = result["payment"]

        self.assertFalse(
            Commission.objects.filter(payment=payment).exists(),
            msg="Commission should not be created for zero-rate partner.",
        )

    def test_duplicate_safe_payment_does_not_create_duplicate_commission(self):
        first = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-004",
        )

        second = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-004",
        )

        payment = first["payment"]

        self.assertFalse(second["created"])
        self.assertEqual(second["payment"].id, payment.id)

        commissions = Commission.objects.filter(payment=payment)
        self.assertEqual(
            commissions.count(),
            1,
            msg=f"Expected exactly one commission for duplicate-safe payment, got {commissions.count()}",
        )

    def test_payment_reversal_reverses_commission(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-005",
        )

        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="commission reversal test",
        )

        commission = Commission.objects.get(payment=payment)

        self.assertEqual(commission.status, CommissionStatus.REVERSED)
        self.assertEqual(commission.reversal_reason, "commission reversal test")

        reversal_metadata = (commission.metadata or {}).get("reversal", {})
        self.assertEqual(reversal_metadata.get("reason"), "commission reversal test")
        self.assertEqual(reversal_metadata.get("source_payment_id"), payment.id)
        self.assertEqual(reversal_metadata.get("reversed_by_id"), self.admin.id)

    def test_reversed_commission_is_not_recreated(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-006",
        )

        payment = result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="commission reversal guard",
        )

        commission = Commission.objects.get(payment=payment)
        self.assertEqual(commission.status, CommissionStatus.REVERSED)

        second = create_commission_for_payment(payment=payment, actor=self.admin)

        self.assertFalse(second["created"])
        self.assertEqual(second["commission"].id, commission.id)
        self.assertEqual(
            Commission.objects.filter(payment=payment).count(),
            1,
            msg="Should not create a new commission when reversed commission exists.",
        )

    def test_waived_emi_does_not_create_commission(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-007",
        )

        payment = result["payment"]

        Commission.objects.filter(payment=payment).delete()
        self.emi.status = EmiStatus.WAIVED
        self.emi.save(update_fields=["status"])
        payment.refresh_from_db()
        payment.emi.refresh_from_db()

        response = create_commission_for_payment(payment=payment, actor=self.admin)

        self.assertFalse(response["created"])
        self.assertIsNone(response["commission"])
        self.assertFalse(
            Commission.objects.filter(payment=payment).exists(),
            msg="Commission should not be created for waived EMI payments.",
        )

    def test_commission_rounding_uses_half_up(self):
        self.partner.commission_rate = Decimal("0.50")
        self.partner.save(update_fields=["commission_rate"])

        tiny_emi = create_emi(
            subscription=self.subscription,
            month_no=2,
            amount=Decimal("1.00"),
            due_date=date(2026, 4, 7),
        )

        result = record_emi_payment(
            emi_id=tiny_emi.id,
            amount=Decimal("1.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-008",
        )

        commission = Commission.objects.get(payment=result["payment"])

        self.assertEqual(
            commission.commission_amount,
            Decimal("0.01"),
            msg="ROUND_HALF_UP should round 0.005 to 0.01.",
        )

    def test_backfill_command_is_rerunnable(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-009",
        )

        payment = result["payment"]

        Commission.objects.filter(payment=payment).delete()
        self.assertFalse(Commission.objects.filter(payment=payment).exists())

        call_command("backfill_commissions_from_payments", payment_id=payment.id)
        call_command("backfill_commissions_from_payments", payment_id=payment.id)

        self.assertEqual(
            Commission.objects.filter(payment=payment).count(),
            1,
            msg="Backfill should be safe to rerun without duplicates.",
        )

    def test_backfill_creates_commission_after_rate_update(self):
        self.partner.commission_rate = Decimal("0.00")
        self.partner.save(update_fields=["commission_rate"])

        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-010",
        )

        payment = result["payment"]

        self.assertFalse(
            Commission.objects.filter(payment=payment).exists(),
            msg="Commission should not exist when rate is zero.",
        )

        self.partner.commission_rate = Decimal("7.50")
        self.partner.save(update_fields=["commission_rate"])

        call_command("backfill_commissions_from_payments", payment_id=payment.id)

        commission = Commission.objects.filter(payment=payment).first()
        self.assertIsNotNone(commission)
        self.assertEqual(commission.commission_rate, Decimal("7.50"))

    def test_commission_rate_change_does_not_mutate_existing_commission(self):
        result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("1000.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="COM-PAY-011",
        )

        payment = result["payment"]
        commission = Commission.objects.get(payment=payment)

        self.partner.commission_rate = Decimal("12.00")
        self.partner.save(update_fields=["commission_rate"])

        commission.refresh_from_db()
        self.assertEqual(commission.commission_rate, Decimal("5.00"))
        self.assertEqual(commission.commission_amount, Decimal("50.00"))
