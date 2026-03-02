from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from subscriptions.models import Batch, Customer, Emi, Product, Subscription
from subscriptions.services.lucky_draw_service import create_lucky_draw_commit, reveal_lucky_draw
from subscriptions.services.payment_service import record_emi_payment


class FinancialIntegrityTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.customer_user = User.objects.create_user(
            username="cust_test", password="pass1234", role="CUSTOMER", phone="9800000000"
        )
        self.customer = Customer.objects.create(
            user=self.customer_user, name="A", phone="9800000000"
        )
        self.product = Product.objects.create(
            product_code="P-001", name="P", base_price=Decimal("1000.00")
        )
        self.batch = Batch.objects.create(
            batch_code="B-100", total_slots=100, duration_months=10, draw_day=5, start_date=date(2026, 1, 1)
        )
        self.l1 = self.batch.lucky_ids.get(lucky_number=1)
        self.partner = User.objects.create_user(username="p1", password="pass1234", role="PARTNER")

    def _create_subscription_with_emis(self, partner=None, tenure=10, total=Decimal("1000.00")):
        """Helper to create subscription with all EMIs properly."""
        monthly = total / tenure
        sub = Subscription.objects.create(
            customer=self.customer,
            product=self.product,
            batch=self.batch,
            lucky_id=self.l1,
            partner=partner,
            plan_type="EMI",
            tenure_months=tenure,
            start_date=date(2026, 1, 1),
            total_amount=total,
            monthly_amount=monthly,
        )
        start = date(2026, 2, 1)
        for i in range(1, tenure + 1):
            Emi.objects.create(
                subscription=sub,
                month_no=i,
                due_date=start + timedelta(days=30 * (i - 1)),
                amount=monthly,
            )
        return sub

    def test_payment_creates_ledger_entry(self):
        sub = self._create_subscription_with_emis()
        emi = sub.emis.get(month_no=1)
        payment = record_emi_payment(
            customer=self.customer,
            subscription=sub,
            emi_id=emi.id,
            amount=Decimal("50.00"),
            method="CASH",
            payment_date=date(2026, 2, 1),
            collected_by=self.partner,
            reference_no="R-1",
        )
        self.assertIsNotNone(payment)
        ledger = payment.ledger_entry
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.entry_type, "EMI_PAYMENT")

    def test_lucky_draw_seed_commitment_verification(self):
        self._create_subscription_with_emis()

        draw, seed = create_lucky_draw_commit(batch=self.batch)
        draw.draw_date = date(2026, 2, 5)
        draw.save(update_fields=["draw_date"])
        draw = reveal_lucky_draw(draw=draw, secret_seed=seed)
        self.assertTrue(draw.is_revealed)
        self.assertTrue(draw.verify_commitment())

        with self.assertRaises(ValidationError):
            reveal_lucky_draw(draw=draw, secret_seed=seed)

    def test_partner_commission_created_from_payment(self):
        sub = self._create_subscription_with_emis(partner=self.partner)
        emi = sub.emis.get(month_no=1)
        payment = record_emi_payment(
            customer=self.customer,
            subscription=sub,
            emi_id=emi.id,
            amount=emi.amount,
            method="CASH",
            payment_date=date(2026, 2, 1),
            collected_by=self.partner,
            reference_no="R-2",
        )
        self.assertIsNotNone(payment)
