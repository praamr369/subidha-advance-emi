from decimal import Decimal
from datetime import date

from django.test import TestCase

from subscriptions.models import CommissionStatus
from subscriptions.services.commission_service import settle_commission
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


class CommissionSettlementDomainTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="commission_settle_admin",
            phone="9101000001",
        )

        self.partner = create_partner_user(
            username="commission_settle_partner",
            phone="9101000002",
        )
        self.partner.commission_rate = Decimal("10.00")
        self.partner.save(update_fields=["commission_rate"])

        self.customer = create_customer_profile(
            name="Settlement Customer",
            phone="7408000001",
        )

        self.product = create_product(
            name="Settlement Product",
            product_code="SETTLE-001",
            base_price=Decimal("1000.00"),
        )

        self.batch = create_batch(
            batch_code="SETTLEBATCH01",
            duration_months=10,
            total_slots=100,
            draw_day=5,
            start_date=date(2026, 3, 1),
        )

        self.lucky_id = create_lucky_id(batch=self.batch, lucky_number=21)

        self.subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            partner=self.partner,
            batch=self.batch,
            lucky_id=self.lucky_id,
            total_amount=Decimal("1000.00"),
            monthly_amount=Decimal("100.00"),
            tenure_months=10,
        )

        self.emi = create_emi(
            subscription=self.subscription,
            month_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 3, 10),
        )

    def test_settle_pending_commission(self):
        payment_result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SET-DOM-001",
        )
        payment = payment_result["payment"]
        commission = payment.commission

        result = settle_commission(
            commission_id=commission.id,
            settled_by=self.admin,
        )

        commission.refresh_from_db()

        self.assertTrue(result["updated"])
        self.assertEqual(commission.status, CommissionStatus.SETTLED)
        self.assertIsNotNone(commission.settlement_date)
        self.assertIn("settlement", commission.metadata)
        self.assertEqual(
            commission.metadata["settlement"]["settled_by_id"],
            self.admin.id,
        )

    def test_settle_already_settled(self):
        payment_result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SET-DOM-002",
        )
        commission = payment_result["payment"].commission

        first = settle_commission(
            commission_id=commission.id,
            settled_by=self.admin,
        )
        second = settle_commission(
            commission_id=commission.id,
            settled_by=self.admin,
        )

        commission.refresh_from_db()

        self.assertTrue(first["updated"])
        self.assertFalse(second["updated"])
        self.assertEqual(commission.status, CommissionStatus.SETTLED)

    def test_cannot_settle_reversed_commission(self):
        payment_result = record_emi_payment(
            emi_id=self.emi.id,
            amount=Decimal("100.00"),
            collected_by=self.admin,
            method="CASH",
            reference_no="SET-DOM-003",
        )
        payment = payment_result["payment"]

        reverse_payment_for_admin(
            payment_id=payment.id,
            reversed_by=self.admin,
            reason="reverse before settle",
        )

        commission = payment.commission
        commission.refresh_from_db()
        self.assertEqual(commission.status, CommissionStatus.REVERSED)

        with self.assertRaisesMessage(ValueError, "Reversed commission cannot be settled."):
            settle_commission(
                commission_id=commission.id,
                settled_by=self.admin,
            )